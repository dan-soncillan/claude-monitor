import { Hono } from "hono";
import { getDB } from "../db/client";
import { broadcast } from "../ws/broadcaster";
import type { Approval, ApprovalDecision } from "@claude-monitor/shared";

const app = new Hono();

// GET /api/approvals - List approvals
app.get("/", (c) => {
  const db = getDB();
  const status = c.req.query("status");

  let approvals: Approval[];
  if (status) {
    approvals = db
      .query("SELECT * FROM approvals WHERE status = ? ORDER BY created_at DESC")
      .all(status) as Approval[];
  } else {
    approvals = db
      .query("SELECT * FROM approvals ORDER BY created_at DESC")
      .all() as Approval[];
  }

  return c.json(approvals);
});

// GET /api/approvals/:id - Get approval by ID (used by hook polling)
app.get("/:id", (c) => {
  const db = getDB();
  const id = parseInt(c.req.param("id"));

  const approval = db
    .query("SELECT * FROM approvals WHERE id = ?")
    .get(id) as Approval | null;

  if (!approval) {
    return c.json({ error: "Approval not found" }, 404);
  }

  return c.json(approval);
});

// PUT /api/approvals/:id - Make decision on an approval
app.put("/:id", async (c) => {
  const db = getDB();
  const id = parseInt(c.req.param("id"));
  const body = await c.req.json<ApprovalDecision>();

  const existing = db
    .query("SELECT * FROM approvals WHERE id = ?")
    .get(id) as Approval | null;

  if (!existing) {
    return c.json({ error: "Approval not found" }, 404);
  }

  if (existing.status !== "pending") {
    return c.json({ error: `Approval already ${existing.status}` }, 409);
  }

  const updated = db
    .query(
      `UPDATE approvals
       SET status = ?, decided_by = ?, decision_reason = ?, decided_at = datetime('now')
       WHERE id = ?
       RETURNING *`
    )
    .get(body.status, body.decided_by, body.decision_reason || null, id) as Approval;

  // Update session status back to running if approved
  if (body.status === "approved") {
    db.query(
      `UPDATE sessions SET status = 'running', updated_at = datetime('now') WHERE id = ?`
    ).run(existing.session_id);
  }

  broadcast({ type: "approval_updated", data: updated, timestamp: new Date().toISOString() });

  return c.json(updated);
});

export default app;
