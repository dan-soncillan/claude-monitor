import { Hono } from "hono";
import { getDB } from "../db/client";
import { clearRegexCache } from "../services/approval-engine";
import type { ApprovalRule, ApprovalRuleCreate } from "@claude-monitor/shared";

const app = new Hono();

// GET /api/rules - List all approval rules
app.get("/", (c) => {
  const db = getDB();
  const rules = db.query("SELECT * FROM approval_rules ORDER BY id").all() as ApprovalRule[];
  return c.json(rules);
});

// POST /api/rules - Create a new approval rule
app.post("/", async (c) => {
  const body = await c.req.json<ApprovalRuleCreate>();
  const db = getDB();

  const rule = db
    .query(
      `INSERT INTO approval_rules (tool_pattern, input_pattern, action, description)
       VALUES (?, ?, ?, ?)
       RETURNING *`
    )
    .get(body.tool_pattern, body.input_pattern || null, body.action, body.description || null) as ApprovalRule;

  clearRegexCache();
  return c.json(rule, 201);
});

// PUT /api/rules/:id - Update an approval rule
app.put("/:id", async (c) => {
  const db = getDB();
  const id = parseInt(c.req.param("id"));
  const body = await c.req.json<Partial<ApprovalRuleCreate>>();

  const existing = db
    .query("SELECT * FROM approval_rules WHERE id = ?")
    .get(id) as ApprovalRule | null;

  if (!existing) {
    return c.json({ error: "Rule not found" }, 404);
  }

  const rule = db
    .query(
      `UPDATE approval_rules
       SET tool_pattern = ?, input_pattern = ?, action = ?, description = ?
       WHERE id = ?
       RETURNING *`
    )
    .get(
      body.tool_pattern ?? existing.tool_pattern,
      body.input_pattern ?? existing.input_pattern ?? null,
      body.action ?? existing.action,
      body.description ?? existing.description ?? null,
      id
    ) as ApprovalRule;

  clearRegexCache();
  return c.json(rule);
});

// DELETE /api/rules/:id - Delete an approval rule
app.delete("/:id", (c) => {
  const db = getDB();
  const id = parseInt(c.req.param("id"));

  const result = db.query("DELETE FROM approval_rules WHERE id = ?").run(id);

  if (result.changes === 0) {
    return c.json({ error: "Rule not found" }, 404);
  }

  clearRegexCache();
  return c.json({ success: true });
});

export default app;
