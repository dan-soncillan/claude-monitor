import { Hono } from "hono";
import { getDB } from "../db/client";
import { broadcast } from "../ws/broadcaster";
import type { MonthlyCost, MonthlyCostUpdate } from "@claude-monitor/shared";

const app = new Hono();

// POST /api/monthly-cost - Receive monthly cost data from statusline.sh
app.post("/", async (c) => {
  const db = getDB();
  const body = await c.req.json<MonthlyCostUpdate>();

  if (!body.month || body.totalCost == null) {
    return c.json({ error: "month and totalCost are required" }, 400);
  }

  db.query(`
    REPLACE INTO monthly_costs (
      month, total_cost_usd, input_tokens, output_tokens,
      cache_creation_tokens, cache_read_tokens, total_tokens, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(
    body.month,
    body.totalCost,
    body.inputTokens ?? null,
    body.outputTokens ?? null,
    body.cacheCreationTokens ?? null,
    body.cacheReadTokens ?? null,
    body.totalTokens ?? null
  );

  const updated = db.query("SELECT * FROM monthly_costs WHERE month = ?").get(body.month) as MonthlyCost;
  broadcast({ type: "monthly_cost_updated", data: updated, timestamp: new Date().toISOString() });

  return c.json(updated);
});

// GET /api/monthly-cost/current - Get current month's cost
app.get("/current", (c) => {
  const db = getDB();
  const currentMonth = new Date().toISOString().slice(0, 7);
  const cost = db.query("SELECT * FROM monthly_costs WHERE month = ?").get(currentMonth) as MonthlyCost | null;
  if (!cost) {
    return c.json({ month: currentMonth, total_cost_usd: 0 }, 200);
  }
  return c.json(cost);
});

export default app;
