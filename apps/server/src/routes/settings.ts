import { Hono } from "hono";
import { getAllSettings, updateSettings } from "../services/settings";

const app = new Hono();

// GET /api/settings — 全設定取得
app.get("/", (c) => {
  return c.json(getAllSettings());
});

// PUT /api/settings — 部分更新
app.put("/", async (c) => {
  const body = await c.req.json();
  const updated = updateSettings(body);
  return c.json(updated);
});

export default app;
