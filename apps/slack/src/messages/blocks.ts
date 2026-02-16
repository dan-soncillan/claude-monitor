import type { Session, Approval, Event } from "@claude-monitor/shared";

const statusEmoji: Record<string, string> = {
  idle: ":white_circle:",
  running: ":large_green_circle:",
  waiting_input: ":large_yellow_circle:",
  completed: ":white_circle:",
  error: ":red_circle:",
};

/** Extract short directory name from full path */
function shortDir(cwd: string): string {
  if (!cwd) return "unknown";
  const parts = cwd.split("/").filter(Boolean);
  return parts.length > 1 ? parts.slice(-2).join("/") : parts[0] || cwd;
}

export function sessionListBlocks(sessions: Session[]) {
  if (sessions.length === 0) {
    return [
      {
        type: "section",
        text: { type: "mrkdwn", text: "No active sessions." },
      },
    ];
  }

  return [
    {
      type: "header",
      text: { type: "plain_text", text: `Claude Code Sessions (${sessions.length})` },
    },
    ...sessions.map((s) => {
      const lines: string[] = [];
      // Status + ID
      lines.push(`${statusEmoji[s.status] || ":white_circle:"} *${s.id.slice(0, 8)}* — \`${s.status}\``);
      // Task description (prompt)
      if (s.task_description) {
        lines.push(`:speech_balloon: ${s.task_description.slice(0, 100)}`);
      }
      // Last activity
      if (s.last_activity) {
        lines.push(`:gear: ${s.last_activity.slice(0, 100)}`);
      }
      // Directory
      lines.push(`:file_folder: \`${shortDir(s.cwd)}\``);

      return {
        type: "section",
        text: {
          type: "mrkdwn",
          text: lines.join("\n"),
        },
        accessory: {
          type: "button",
          text: { type: "plain_text", text: "View" },
          action_id: `view_session_${s.id}`,
          value: s.id,
        },
      };
    }),
  ];
}

export function sessionStatusBlocks(session: Session, events: Event[]) {
  const recentEvents = events.slice(0, 5);
  const eventLines = recentEvents
    .map(
      (e) =>
        `• \`${e.event_type}\`${e.tool_name ? ` — ${e.tool_name}` : ""}${e.summary ? `: ${e.summary.slice(0, 80)}` : ""}`
    )
    .join("\n");

  const fields = [
    { type: "mrkdwn" as const, text: `*Status:* ${statusEmoji[session.status] || ""} ${session.status}` },
    { type: "mrkdwn" as const, text: `*Directory:* \`${shortDir(session.cwd)}\`` },
  ];

  if (session.task_description) {
    fields.push({ type: "mrkdwn" as const, text: `*Task:* ${session.task_description.slice(0, 150)}` });
  }
  if (session.last_activity) {
    fields.push({ type: "mrkdwn" as const, text: `*Last Activity:* ${session.last_activity.slice(0, 150)}` });
  }

  return [
    {
      type: "header",
      text: { type: "plain_text", text: `Session ${session.id.slice(0, 8)}` },
    },
    {
      type: "section",
      fields,
    },
    ...(session.task_description
      ? []
      : []),
    ...(eventLines
      ? [
          { type: "divider" },
          {
            type: "section",
            text: { type: "mrkdwn", text: `*Recent Events:*\n${eventLines}` },
          },
        ]
      : []),
  ];
}

export function approvalRequestBlocks(approval: Approval) {
  let inputPreview = "";
  try {
    const parsed = JSON.parse(approval.tool_input);
    inputPreview = JSON.stringify(parsed, null, 2).slice(0, 500);
  } catch {
    inputPreview = approval.tool_input.slice(0, 500);
  }

  return [
    {
      type: "header",
      text: { type: "plain_text", text: ":warning: Approval Required" },
    },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Session:* \`${approval.session_id.slice(0, 8)}\`` },
        { type: "mrkdwn", text: `*Tool:* \`${approval.tool_name}\`` },
      ],
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Input:*\n\`\`\`${inputPreview}\`\`\``,
      },
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: ":white_check_mark: Approve" },
          style: "primary",
          action_id: "approve_action",
          value: String(approval.id),
        },
        {
          type: "button",
          text: { type: "plain_text", text: ":x: Reject" },
          style: "danger",
          action_id: "reject_action",
          value: String(approval.id),
        },
        {
          type: "button",
          text: { type: "plain_text", text: "View Context" },
          action_id: "view_context_action",
          value: JSON.stringify({
            approval_id: approval.id,
            session_id: approval.session_id,
          }),
        },
      ],
    },
  ];
}

export function notificationBlocks(session: Session, message: string, response?: string) {
  const taskLine = session.task_description
    ? `\n:speech_balloon: _${session.task_description.slice(0, 80)}_`
    : "";

  const blocks: Record<string, unknown>[] = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `${statusEmoji[session.status] || ""} *Session \`${session.id.slice(0, 8)}\`* (\`${shortDir(session.cwd)}\`): ${message}${taskLine}`,
      },
    },
  ];

  if (response) {
    const truncated = response.length > 2500 ? response.slice(0, 2500) + "..." : response;
    // Quote each line with > for clean separation; no backtick conflict
    const quoted = truncated.split("\n").map((l) => `> ${l}`).join("\n");
    blocks.push(
      {
        type: "context",
        elements: [
          { type: "mrkdwn", text: ":page_facing_up: *Claude's Response*" },
        ],
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: quoted,
        },
      },
    );
  }

  return blocks;
}
