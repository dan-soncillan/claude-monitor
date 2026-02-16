import { Hono } from "hono";
import { getDB } from "../db/client";
import { broadcast } from "../ws/broadcaster";
import type { Session, CLIOutput } from "@claude-monitor/shared";

const app = new Hono();

/** Resolve full path to claude CLI */
function claudePath(): string {
  return process.env.CLAUDE_CLI_PATH || "claude";
}

// --- Process tracking ---
const MAX_CONCURRENT_PROCESSES = parseInt(process.env.MAX_CONCURRENT_PROCESSES || "3");
const PROCESS_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

interface TrackedProcess {
  proc: ReturnType<typeof Bun.spawn>;
  commandId: string;
  sessionId: string;
  startedAt: number;
  timeout: ReturnType<typeof setTimeout>;
}

const activeProcesses = new Map<string, TrackedProcess>();

function cleanupProcess(commandId: string): void {
  const tracked = activeProcesses.get(commandId);
  if (tracked) {
    clearTimeout(tracked.timeout);
    try { tracked.proc.kill(); } catch { /* already dead */ }
    activeProcesses.delete(commandId);
  }
}

/** Kill all tracked processes (called on shutdown) */
export function killAllProcesses(): void {
  for (const [id] of activeProcesses) {
    cleanupProcess(id);
  }
}

// POST /api/sessions/:id/send - Send instruction to existing session
app.post("/:id/send", async (c) => {
  if (activeProcesses.size >= MAX_CONCURRENT_PROCESSES) {
    return c.json(
      { error: `Too many concurrent processes (max ${MAX_CONCURRENT_PROCESSES}). Wait for a running command to finish.` },
      429
    );
  }

  const db = getDB();
  const sessionId = c.req.param("id");
  const { instruction } = await c.req.json<{ instruction: string }>();

  if (!instruction) {
    return c.json({ error: "instruction is required" }, 400);
  }

  // Support prefix match
  let session = db.query("SELECT * FROM sessions WHERE id = ?").get(sessionId) as Session | null;
  if (!session) {
    session = db.query("SELECT * FROM sessions WHERE id LIKE ? || '%'").get(sessionId) as Session | null;
  }
  if (!session) {
    return c.json({ error: "Session not found" }, 404);
  }

  const commandId = crypto.randomUUID();

  try {
    const proc = Bun.spawn(
      [claudePath(), "-r", session.id, "-p", instruction, "--output-format", "text"],
      {
        cwd: session.cwd || undefined,
        stdout: "pipe",
        stderr: "ignore",
        env: { ...process.env, PATH: process.env.PATH },
      }
    );

    trackAndStream(proc, session.id, commandId);
    return c.json({ command_id: commandId, status: "started" });
  } catch (e) {
    return c.json({ error: `Failed to spawn claude CLI: ${e}` }, 500);
  }
});

// POST /api/tasks - Start a new Claude Code task
app.post("/tasks", async (c) => {
  if (activeProcesses.size >= MAX_CONCURRENT_PROCESSES) {
    return c.json(
      { error: `Too many concurrent processes (max ${MAX_CONCURRENT_PROCESSES}). Wait for a running command to finish.` },
      429
    );
  }

  const { instruction, cwd } = await c.req.json<{
    instruction: string;
    cwd: string;
  }>();

  if (!instruction || !cwd) {
    return c.json({ error: "instruction and cwd are required" }, 400);
  }

  const commandId = crypto.randomUUID();

  try {
    const proc = Bun.spawn(
      [claudePath(), "-p", instruction, "--output-format", "text"],
      {
        cwd,
        stdout: "pipe",
        stderr: "ignore",
        env: { ...process.env, PATH: process.env.PATH },
      }
    );

    trackAndStream(proc, "new-task", commandId);
    return c.json({ command_id: commandId, status: "started" });
  } catch (e) {
    return c.json({ error: `Failed to spawn claude CLI: ${e}` }, 500);
  }
});

function trackAndStream(
  proc: ReturnType<typeof Bun.spawn>,
  sessionId: string,
  commandId: string
): void {
  const timeout = setTimeout(() => {
    console.warn(`[CLI] Process ${commandId} timed out after 5 minutes, killing`);
    cleanupProcess(commandId);
    broadcast({
      type: "cli_output",
      data: { session_id: sessionId, command_id: commandId, output: "[timeout] Process killed after 5 minutes", is_complete: true },
      timestamp: new Date().toISOString(),
    });
  }, PROCESS_TIMEOUT_MS);

  activeProcesses.set(commandId, { proc, commandId, sessionId, startedAt: Date.now(), timeout });

  streamOutput(proc, sessionId, commandId).catch((e) => {
    console.error(`[CLI] streamOutput error for ${commandId}:`, e);
  }).finally(() => {
    cleanupProcess(commandId);
  });
}

async function streamOutput(
  proc: ReturnType<typeof Bun.spawn>,
  sessionId: string,
  commandId: string
): Promise<void> {
  if (!proc.stdout || typeof proc.stdout === "number") {
    return;
  }

  const reader = (proc.stdout as ReadableStream<Uint8Array>).getReader();
  const decoder = new TextDecoder();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const output = decoder.decode(value, { stream: true });
      const msg: CLIOutput = {
        session_id: sessionId,
        command_id: commandId,
        output,
        is_complete: false,
      };
      broadcast({ type: "cli_output", data: msg, timestamp: new Date().toISOString() });
    }
  } finally {
    // Always release the reader lock to prevent stream/fd leaks
    try { reader.cancel(); } catch { /* ignore */ }
    try { reader.releaseLock(); } catch { /* ignore */ }
  }

  broadcast({
    type: "cli_output",
    data: { session_id: sessionId, command_id: commandId, output: "", is_complete: true },
    timestamp: new Date().toISOString(),
  });
}

export default app;
