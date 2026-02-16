import { Hono } from "hono";
import { getDB } from "../db/client";
import { broadcast } from "../ws/broadcaster";
import type { Session } from "@claude-monitor/shared";

const STALE_IDLE_MINUTES = 3;      // Idle sessions (never received a prompt) - delete quickly
const STALE_GHOST_MINUTES = 5;     // Ghost sessions (no activity) - delete quickly
const STALE_INACTIVE_MINUTES = 5;  // Inactive running sessions - mark completed
const COMPLETED_RETENTION_HOURS = parseInt(process.env.CLEANUP_COMPLETED_RETENTION_HOURS || "2");
const MAX_EVENTS_PER_SESSION = parseInt(process.env.CLEANUP_MAX_EVENTS_PER_SESSION || "500");

const app = new Hono();

/** Delete a session and its related data */
function deleteSessionCascade(db: ReturnType<typeof getDB>, condition: string, params: (string | number)[]) {
  // Find sessions to delete
  const ids = db.query(`SELECT id FROM sessions WHERE ${condition}`)
    .all(...params) as { id: string }[];
  if (ids.length === 0) return;

  const placeholders = ids.map(() => "?").join(",");
  const idValues = ids.map((r) => r.id);

  db.query(`DELETE FROM events WHERE session_id IN (${placeholders})`).run(...idValues);
  db.query(`DELETE FROM approvals WHERE session_id IN (${placeholders})`).run(...idValues);
  db.query(`DELETE FROM sessions WHERE id IN (${placeholders})`).run(...idValues);
}

/** Clean up stale and old sessions */
export function cleanupStaleSessions() {
  const db = getDB();

  // Delete idle sessions that never received a prompt
  deleteSessionCascade(db,
    `status = 'idle' AND updated_at < datetime('now', ?)`,
    [`-${STALE_IDLE_MINUTES} minutes`]
  );

  // Delete ghost sessions: no real activity after a short time
  deleteSessionCascade(db,
    `status IN ('running', 'waiting_input')
     AND updated_at < datetime('now', ?)
     AND (task_description IS NULL OR task_description = '')
     AND (last_activity IS NULL OR last_activity = 'No activity yet')`,
    [`-${STALE_GHOST_MINUTES} minutes`]
  );

  // Mark stale running sessions as completed
  db.query(
    `UPDATE sessions
     SET status = 'completed', last_activity = COALESCE(last_activity, 'Session timed out')
     WHERE status = 'running'
       AND updated_at < datetime('now', ?)`,
  ).run(`-${STALE_INACTIVE_MINUTES} minutes`);

  // Mark stale waiting_input sessions as completed (terminal may have been closed without session_end)
  db.query(
    `UPDATE sessions
     SET status = 'completed', last_activity = COALESCE(last_activity, 'Session timed out')
     WHERE status = 'waiting_input'
       AND updated_at < datetime('now', '-15 minutes')`,
  ).run();

  // Delete old completed sessions (older than retention period)
  deleteSessionCascade(db,
    `status = 'completed' AND updated_at < datetime('now', ?)`,
    [`-${COMPLETED_RETENTION_HOURS} hours`]
  );
}

/** Trim events exceeding MAX_EVENTS_PER_SESSION per session, keeping the newest ones. Returns total deleted count. */
export function trimSessionEvents(): number {
  const db = getDB();
  // Find sessions with more events than the limit
  const overflowing = db.query(
    `SELECT session_id, COUNT(*) as cnt FROM events GROUP BY session_id HAVING cnt > ?`
  ).all(MAX_EVENTS_PER_SESSION) as { session_id: string; cnt: number }[];

  let totalDeleted = 0;
  for (const { session_id, cnt } of overflowing) {
    const excess = cnt - MAX_EVENTS_PER_SESSION;
    // Delete oldest events beyond the limit
    db.query(
      `DELETE FROM events WHERE id IN (
        SELECT id FROM events WHERE session_id = ? ORDER BY id ASC LIMIT ?
      )`
    ).run(session_id, excess);
    totalDeleted += excess;
  }
  return totalDeleted;
}

// GET /api/sessions/directories - List distinct working directories
app.get("/directories", (c) => {
  const db = getDB();
  const rows = db
    .query("SELECT DISTINCT cwd FROM sessions WHERE cwd != '' AND cwd IS NOT NULL ORDER BY cwd")
    .all() as { cwd: string }[];
  return c.json(rows.map((r) => r.cwd));
});

// GET /api/sessions - List all sessions
app.get("/", (c) => {
  cleanupStaleSessions();

  const db = getDB();
  const status = c.req.query("status");

  let sessions: Session[];
  if (status) {
    sessions = db
      .query("SELECT * FROM sessions WHERE status = ? ORDER BY updated_at DESC")
      .all(status) as Session[];
  } else {
    sessions = db
      .query("SELECT * FROM sessions ORDER BY updated_at DESC")
      .all() as Session[];
  }

  return c.json(sessions);
});

/** Resolve a full or prefix session ID to the full ID */
function resolveSessionId(id: string): Session | null {
  const db = getDB();
  // Try exact match first
  let session = db.query("SELECT * FROM sessions WHERE id = ?").get(id) as Session | null;
  if (session) return session;
  // Try prefix match
  session = db.query("SELECT * FROM sessions WHERE id LIKE ?").get(id + "%") as Session | null;
  return session;
}

// GET /api/sessions/:id - Get session by ID (supports prefix)
app.get("/:id", (c) => {
  const id = c.req.param("id");
  const session = resolveSessionId(id);

  if (!session) {
    return c.json({ error: "Session not found" }, 404);
  }

  return c.json(session);
});

// GET /api/sessions/:id/events - Get events for a session (supports prefix)
app.get("/:id/events", (c) => {
  const db = getDB();
  const id = c.req.param("id");
  const limit = parseInt(c.req.query("limit") || "100");
  const offset = parseInt(c.req.query("offset") || "0");

  const session = resolveSessionId(id);
  if (!session) {
    return c.json({ error: "Session not found" }, 404);
  }

  const events = db
    .query(
      "SELECT * FROM events WHERE session_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?"
    )
    .all(session.id, limit, offset);

  return c.json(events);
});

// POST /api/sessions/:id/complete - Manually mark a session as completed
app.post("/:id/complete", (c) => {
  const db = getDB();
  const id = c.req.param("id");
  const session = resolveSessionId(id);
  if (!session) {
    return c.json({ error: "Session not found" }, 404);
  }
  if (session.status === "completed") {
    return c.json(session);
  }

  db.query(
    `UPDATE sessions SET status = 'completed', last_activity = COALESCE(last_activity, 'Manually completed'), updated_at = datetime('now') WHERE id = ?`
  ).run(session.id);

  const updated = db.query("SELECT * FROM sessions WHERE id = ?").get(session.id) as Session;
  broadcast({ type: "session_updated", data: updated, timestamp: new Date().toISOString() });

  return c.json(updated);
});

// POST /api/sessions/:id/read - Mark a session as read (syncs across all clients via WebSocket)
app.post("/:id/read", (c) => {
  const db = getDB();
  const id = c.req.param("id");
  const session = resolveSessionId(id);
  if (!session) {
    return c.json({ error: "Session not found" }, 404);
  }

  // Skip if already read after the latest update (prevents broadcast loop)
  if (session.read_at && session.updated_at && session.read_at >= session.updated_at) {
    return c.json(session);
  }

  db.query("UPDATE sessions SET read_at = datetime('now') WHERE id = ?").run(session.id);
  const updated = db.query("SELECT * FROM sessions WHERE id = ?").get(session.id) as Session;
  broadcast({ type: "session_updated", data: updated, timestamp: new Date().toISOString() });

  return c.json(updated);
});

// PUT /api/sessions/:id/notes - Update session notes (personal memo, no broadcast)
app.put("/:id/notes", async (c) => {
  const db = getDB();
  const id = c.req.param("id");
  const session = resolveSessionId(id);
  if (!session) {
    return c.json({ error: "Session not found" }, 404);
  }

  const body = await c.req.json<{ notes: string }>();
  const MAX_NOTES_LENGTH = 10000;
  const notes = typeof body.notes === "string"
    ? body.notes.slice(0, MAX_NOTES_LENGTH)
    : "";

  // Do NOT update updated_at to avoid triggering read_at loop
  db.query("UPDATE sessions SET notes = ? WHERE id = ?").run(notes, session.id);

  return c.json({ ok: true });
});

// DELETE /api/sessions - Bulk delete sessions by status (e.g. ?status=completed&cwd=/path/to/project)
app.delete("/", (c) => {
  const db = getDB();
  const status = c.req.query("status");
  const cwd = c.req.query("cwd");
  if (!status) {
    return c.json({ error: "Query parameter 'status' is required" }, 400);
  }

  let sessions: { id: string }[];
  if (cwd) {
    sessions = db.query("SELECT id FROM sessions WHERE status = ? AND cwd = ?").all(status, cwd) as { id: string }[];
    if (sessions.length === 0) return c.json({ deleted: 0 });
    deleteSessionCascade(db, "status = ? AND cwd = ?", [status, cwd]);
  } else {
    sessions = db.query("SELECT id FROM sessions WHERE status = ?").all(status) as { id: string }[];
    if (sessions.length === 0) return c.json({ deleted: 0 });
    deleteSessionCascade(db, "status = ?", [status]);
  }

  for (const s of sessions) {
    broadcast({ type: "session_deleted", data: { id: s.id }, timestamp: new Date().toISOString() });
  }

  return c.json({ deleted: sessions.length });
});

// DELETE /api/sessions/:id - Delete a single session
app.delete("/:id", (c) => {
  const db = getDB();
  const id = c.req.param("id");
  const session = resolveSessionId(id);
  if (!session) {
    return c.json({ error: "Session not found" }, 404);
  }

  deleteSessionCascade(db, "id = ?", [session.id]);
  broadcast({ type: "session_deleted", data: { id: session.id }, timestamp: new Date().toISOString() });

  return c.json({ deleted: 1 });
});

export default app;
