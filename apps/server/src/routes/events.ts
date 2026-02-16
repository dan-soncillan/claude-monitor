import { Hono } from "hono";
import { getDB } from "../db/client";
import { broadcast } from "../ws/broadcaster";
import { processPreToolUse } from "../services/approval-engine";
import { sendMacNotification } from "../services/mac-notifier";
import type { EventCreate, Session, Event, SessionStatus } from "@claude-monitor/shared";

const app = new Hono();

/** Strip system-reminder, task-notification and other injected XML tags from text */
function stripSystemTags(text: string): string {
  return text
    .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, "")
    .replace(/<task-notification>[\s\S]*?<\/task-notification>/g, "")
    .replace(/<command-name>[\s\S]*?<\/command-name>/g, "")
    .trim();
}

/** Build a human-readable activity string from an event */
function buildActivity(eventType: string, toolName?: string, toolInput?: unknown, summary?: string): string | null {
  switch (eventType) {
    case "user_prompt": {
      const prompt = typeof summary === "string" ? summary : "";
      return prompt.length > 120 ? prompt.slice(0, 120) + "..." : prompt;
    }
    case "pre_tool_use":
    case "post_tool_use": {
      if (!toolName) return null;
      let detail = "";
      if (toolInput && typeof toolInput === "object") {
        const input = toolInput as Record<string, unknown>;
        // Extract the most useful field per tool
        if (toolName === "Bash" && input.command) {
          detail = `: ${String(input.command).slice(0, 80)}`;
        } else if (toolName === "Read" && input.file_path) {
          detail = `: ${String(input.file_path)}`;
        } else if ((toolName === "Edit" || toolName === "Write") && input.file_path) {
          detail = `: ${String(input.file_path)}`;
        } else if (toolName === "Grep" && input.pattern) {
          detail = `: ${String(input.pattern)}`;
        } else if (toolName === "Glob" && input.pattern) {
          detail = `: ${String(input.pattern)}`;
        } else if (toolName === "Task" && input.description) {
          detail = `: ${String(input.description).slice(0, 60)}`;
        }
      }
      return `${toolName}${detail}`;
    }
    case "notification":
      return summary ? `Notification: ${summary.slice(0, 100)}` : null;
    case "stop": {
      if (summary && !summary.startsWith("Stopped:")) {
        return summary.length > 120 ? summary.slice(0, 120) + "..." : summary;
      }
      return "Session stopped";
    }
    case "session_end":
      return "Session ended";
    default:
      return null;
  }
}

// POST /api/events - Receive event from Claude Code hooks
app.post("/", async (c) => {
  const body = await c.req.json<EventCreate>();
  const db = getDB();

  const { session_id, event_type, tool_name, tool_input, tool_response } = body;
  // Clean system-injected XML tags from summary
  const summary = body.summary ? stripSystemTags(body.summary) : body.summary;

  // Ensure session exists (upsert) — hooks may arrive before session_start
  const inputCwd = (tool_input as any)?.cwd || (body as any).cwd || "";
  const inputModel = (tool_input as any)?.model || null;

  if (event_type === "session_start") {
    db.query(
      `INSERT INTO sessions (id, status, cwd, model, updated_at)
       VALUES (?, 'idle', ?, ?, datetime('now'))
       ON CONFLICT(id) DO UPDATE SET
         status = CASE WHEN sessions.status = 'idle' THEN 'idle' ELSE sessions.status END,
         cwd = CASE WHEN sessions.cwd = '' OR sessions.cwd IS NULL THEN ? ELSE sessions.cwd END,
         model = COALESCE(?, model),
         updated_at = datetime('now')`
    ).run(session_id, inputCwd, inputModel, inputCwd, inputModel);

    // Carry forward context from predecessor session in same cwd
    if (inputCwd) {
      const predecessor = db.query(`
        SELECT id, waiting_context, task_description, notes FROM sessions
        WHERE cwd = ? AND id != ?
          AND status IN ('waiting_input', 'completed')
          AND waiting_context IS NOT NULL
          AND updated_at > datetime('now', '-3 minutes')
        ORDER BY updated_at DESC LIMIT 1
      `).get(inputCwd, session_id) as { id: string; waiting_context: string; task_description: string | null; notes: string | null } | null;

      if (predecessor) {
        // Copy context and notes to new session
        db.query(`UPDATE sessions SET
          waiting_context = ?,
          task_description = COALESCE(task_description, ?),
          notes = COALESCE(notes, ?)
          WHERE id = ?`
        ).run(predecessor.waiting_context, predecessor.task_description, predecessor.notes, session_id);

        // Mark predecessor as completed
        db.query(`UPDATE sessions SET
          status = 'completed',
          updated_at = datetime('now')
          WHERE id = ? AND status != 'completed'`
        ).run(predecessor.id);

        // Broadcast predecessor update
        const updated = db.query("SELECT * FROM sessions WHERE id = ?").get(predecessor.id) as Session;
        broadcast({ type: "session_updated", data: updated, timestamp: new Date().toISOString() });

        console.log(`[SessionContext] Carried forward from ${predecessor.id.slice(0, 8)} → ${session_id.slice(0, 8)}`);
      }
    }
  } else {
    // Auto-create session if it doesn't exist yet; update cwd if still empty
    db.query(
      `INSERT INTO sessions (id, status, cwd, updated_at)
       VALUES (?, 'running', ?, datetime('now'))
       ON CONFLICT(id) DO UPDATE SET
         cwd = CASE WHEN sessions.cwd = '' OR sessions.cwd IS NULL THEN ? ELSE sessions.cwd END`
    ).run(session_id, inputCwd, inputCwd);
  }

  // Update task_description with the latest user prompt
  if (event_type === "user_prompt" && summary) {
    const truncated = summary.length > 200 ? summary.slice(0, 200) + "..." : summary;
    db.query(
      `UPDATE sessions SET task_description = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(truncated, session_id);
  }

  // Determine new session status based on event type
  // Lifecycle: idle → running ↔ waiting_input → completed
  //   session_start → idle (just created)
  //   user_prompt → running (user sent input)
  //   pre_tool_use → running (or waiting_input for AskUserQuestion/ExitPlanMode)
  //   stop(end_turn/max_tokens) → completed (Claude finished)
  //   stop(tool_use) → no change (Claude continues with tools)
  //   session_end → completed (session fully closed, kept for review)
  //   notification(permission/idle) → waiting_input
  const USER_INPUT_TOOLS = new Set(["AskUserQuestion", "ExitPlanMode"]);

  let newStatus: SessionStatus | null = null;
  let waitingContext: string | null = null; // What Claude is asking the user

  switch (event_type) {
    case "session_start":
      newStatus = "idle";
      break;
    case "session_end":
      newStatus = "completed";
      break;
    case "stop": {
      // stop_reason is mapped to tool_name by stop.sh
      // tool_use = Claude is about to call a tool (still working, no status change)
      // All other reasons = Claude has stopped responding → completed
      const stopReason = tool_name;
      if (stopReason !== "tool_use") {
        newStatus = "completed";
      }
      break;
    }
    case "notification": {
      // Guard: only transition to waiting_input from active states (running/idle).
      // Completed sessions must NOT be overridden by late-arriving notifications
      // (e.g. idle_prompt fires after stop event when Claude waits for next prompt).
      const current = db.query("SELECT status FROM sessions WHERE id = ?").get(session_id) as Session | null;
      const isActive = current && (current.status === "running" || current.status === "idle");

      const notificationType = tool_name; // notification.sh maps notification_type to tool_name
      if (notificationType === "idle_prompt" && isActive) {
        newStatus = "waiting_input";
        waitingContext = "ターミナルで入力を待っています。\n\n" + (summary || "");
      } else if (notificationType === "permission_prompt" && isActive) {
        newStatus = "waiting_input";
        // Don't overwrite existing waiting_context (e.g. from ExitPlanMode/AskUserQuestion)
        const currentSession = db.query(
          "SELECT waiting_context FROM sessions WHERE id = ?"
        ).get(session_id) as { waiting_context: string | null } | null;
        if (!currentSession?.waiting_context) {
          waitingContext = "**ツール実行の許可が必要です。** ターミナルで許可または拒否してください。\n\n" + (summary || "");
        }
      } else if (summary?.includes("needs your attention") && isActive) {
        newStatus = "waiting_input";
        waitingContext = summary || null;
      }
      break;
    }
    case "pre_tool_use":
      if (USER_INPUT_TOOLS.has(tool_name || "")) {
        newStatus = "waiting_input";
        // Extract question/plan context from tool_input
        if (tool_name === "AskUserQuestion" && tool_input && typeof tool_input === "object") {
          const input = tool_input as Record<string, unknown>;
          const question = input.question || "";
          const options = input.options as Array<{ label: string; description?: string }> | undefined;
          let ctx = String(question);
          if (options?.length) {
            ctx += "\n\n" + options.map((o, i) =>
              `${i + 1}. **${o.label}**${o.description ? ` — ${o.description}` : ""}`
            ).join("\n");
          }
          waitingContext = ctx;
        } else if (tool_name === "ExitPlanMode") {
          // Read plan from tool_input (Claude Code includes plan content in tool_input fields)
          const input = tool_input as Record<string, unknown> | undefined;
          let planBody = "";
          if (input) {
            // Try known fields where plan content may appear
            for (const key of ["plan", "content", "body", "text"]) {
              if (typeof input[key] === "string" && input[key]) {
                planBody = input[key] as string;
                break;
              }
            }
          }
          // Fallback: try previous stop event summary
          if (!planBody) {
            const prevStop = db.query(
              `SELECT summary FROM events WHERE session_id = ? AND event_type = 'stop' AND summary IS NOT NULL ORDER BY id DESC LIMIT 1`
            ).get(session_id) as { summary: string } | null;
            planBody = prevStop?.summary || "";
          }
          waitingContext = planBody
            ? `**プランの承認待ちです。** ターミナルで承認または却下してください。\n\n---\n\n${planBody}`
            : "プランの承認待ちです。ターミナルで承認または却下してください。";
        }
      } else {
        newStatus = "running";
      }
      break;
    case "user_prompt":
      newStatus = "running";
      break;
    case "post_tool_use":
      // Any tool completion means Claude is active again.
      // Covers both USER_INPUT_TOOLS (AskUserQuestion answered) and
      // regular tools after permission_prompt was granted.
      newStatus = "running";
      break;
  }

  // Build last_activity
  const activity = buildActivity(event_type, tool_name, tool_input, summary);

  // Insert event
  const toolInputStr = tool_input != null ? JSON.stringify(tool_input) : null;
  const toolResponseStr = tool_response != null ? JSON.stringify(tool_response) : null;

  const result = db
    .query(
      `INSERT INTO events (session_id, event_type, tool_name, tool_input, tool_response, summary)
       VALUES (?, ?, ?, ?, ?, ?)
       RETURNING *`
    )
    .get(session_id, event_type, tool_name || null, toolInputStr, toolResponseStr, summary || null) as Event;

  // Process approval rules for pre_tool_use events (before session status update)
  let approval = null;
  if (event_type === "pre_tool_use") {
    approval = processPreToolUse(result);
    // Override status to waiting_input when approval is pending
    if (approval && approval.status === "pending") {
      newStatus = "waiting_input";
    }
  }

  // Capture previous status for transition detection
  let prevStatus: string | null = null;
  if (newStatus) {
    const current = db.query("SELECT status FROM sessions WHERE id = ?")
      .get(session_id) as { status: string } | null;
    prevStatus = current?.status ?? null;
  }

  // Update session status, last_activity, and waiting_context
  if (newStatus || activity) {
    const updates: string[] = ["updated_at = datetime('now')"];
    const params: (string | null)[] = [];

    if (newStatus) {
      updates.push("status = ?");
      params.push(newStatus);
      // Set or clear waiting_context
      if (newStatus === "waiting_input") {
        // Only update waiting_context if we have a new value; preserve existing otherwise
        if (waitingContext !== null) {
          updates.push("waiting_context = ?");
          params.push(waitingContext);
        }
      } else if (event_type === "user_prompt") {
        // Clear only on new user prompt (new conversation turn replaces previous context)
        updates.push("waiting_context = NULL");
      }
      // For running/completed/idle, preserve waiting_context so UI can show it collapsed
    }
    if (activity) {
      updates.push("last_activity = ?");
      params.push(activity);
    }
    params.push(session_id);

    db.query(`UPDATE sessions SET ${updates.join(", ")} WHERE id = ?`).run(...params);

    const updatedSession = db
      .query("SELECT * FROM sessions WHERE id = ?")
      .get(session_id) as Session;

    broadcast({ type: "session_updated", data: updatedSession, timestamp: new Date().toISOString() });

    // Mac native notification on actual status transition
    if (newStatus && newStatus !== prevStatus &&
        (newStatus === "waiting_input" || newStatus === "completed")) {
      sendMacNotification(updatedSession, newStatus).catch(console.error);
    }
  }

  // Broadcast the event
  broadcast({ type: "event_created", data: result, timestamp: new Date().toISOString() });

  // session_end: delete subagent sessions (no user_prompt → no task_description),
  // keep real sessions as "completed" for user review.
  if (event_type === "session_end") {
    const endingSession = db.query("SELECT * FROM sessions WHERE id = ?").get(session_id) as Session | null;
    if (endingSession && !endingSession.task_description) {
      // No user prompt was ever received → subagent or ephemeral session, clean up
      db.query("DELETE FROM events WHERE session_id = ?").run(session_id);
      db.query("DELETE FROM approvals WHERE session_id = ?").run(session_id);
      db.query("DELETE FROM sessions WHERE id = ?").run(session_id);
      broadcast({ type: "session_deleted", data: { id: session_id }, timestamp: new Date().toISOString() });
    }
  }

  return c.json({ event: result, approval }, 201);
});

export default app;
