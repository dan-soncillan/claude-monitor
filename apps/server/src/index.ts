import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { getDB, closeDB } from "./db/client";
import { addClient, removeClient, getClientCount } from "./ws/broadcaster";
import { checkMemory } from "./services/memory-watchdog";
import sessionsRouter, { cleanupStaleSessions, trimSessionEvents } from "./routes/sessions";
import eventsRouter from "./routes/events";
import approvalsRouter from "./routes/approvals";
import rulesRouter from "./routes/rules";
import commandsRouter, { killAllProcesses } from "./routes/commands";
import settingsRouter from "./routes/settings";
import monthlyCostsRouter from "./routes/monthly-costs";

const app = new Hono();

// Middleware
app.use("*", cors());
// Only log non-polling requests to reduce noise
const QUIET_GET_PATHS = new Set(["/api/sessions", "/api/health", "/api/approvals"]);
const QUIET_PATH_SUFFIXES = ["/read", "/monthly-cost"];
app.use("*", async (c, next) => {
  const path = c.req.path;
  if (c.req.method === "GET" && QUIET_GET_PATHS.has(path)) {
    return next();
  }
  if (QUIET_PATH_SUFFIXES.some((s) => path.endsWith(s))) {
    return next();
  }
  return logger()(c, next);
});

// Health check with memory stats
app.get("/api/health", (c) => {
  const mem = process.memoryUsage();
  return c.json({
    status: "ok",
    clients: getClientCount(),
    memory: {
      rss_mb: Math.round(mem.rss / 1024 / 1024),
      heap_used_mb: Math.round(mem.heapUsed / 1024 / 1024),
      heap_total_mb: Math.round(mem.heapTotal / 1024 / 1024),
    },
    timestamp: new Date().toISOString(),
  });
});

// Routes
app.route("/api/sessions", sessionsRouter);
app.route("/api/events", eventsRouter);
app.route("/api/approvals", approvalsRouter);
app.route("/api/rules", rulesRouter);
app.route("/api/sessions", commandsRouter);
app.route("/api", commandsRouter);
app.route("/api/settings", settingsRouter);
app.route("/api/monthly-cost", monthlyCostsRouter);

// Initialize DB on startup
getDB();

const port = parseInt(process.env.PORT || "4000");

const server = Bun.serve({
  port,
  fetch: app.fetch,
  websocket: {
    open(ws) {
      addClient(ws);
      ws.send(
        JSON.stringify({
          type: "connected",
          data: { message: "Connected to ClaudeMonitor" },
          timestamp: new Date().toISOString(),
        })
      );
      // Send current sessions on connect (limit to 100 most recent to prevent memory spike)
      cleanupStaleSessions();
      const db = getDB();
      const sessions = db.query("SELECT * FROM sessions ORDER BY updated_at DESC LIMIT 100").all();
      // Send as a single batch message instead of individual messages
      ws.send(
        JSON.stringify({
          type: "sessions_sync",
          data: sessions,
          timestamp: new Date().toISOString(),
        })
      );
    },
    message(_ws, _message) {
      // Client messages not needed for now
    },
    close(ws) {
      removeClient(ws);
    },
  },
});

// Upgrade WebSocket connections
const originalFetch = app.fetch;
app.fetch = (req: Request, ...rest: any[]) => {
  const url = new URL(req.url);
  if (url.pathname === "/ws") {
    const upgraded = server.upgrade(req);
    if (upgraded) return undefined as any;
    return new Response("WebSocket upgrade failed", { status: 400 });
  }
  return originalFetch.call(app, req, ...rest);
};
// Re-assign the fetch handler after patching
server.reload({ fetch: app.fetch });

console.log(`ClaudeMonitor server running on http://localhost:${port}`);
console.log(`WebSocket available at ws://localhost:${port}/ws`);

// Periodic DB cleanup
const CLEANUP_INTERVAL_MS =
  parseInt(process.env.CLEANUP_INTERVAL_MINUTES || "5") * 60 * 1000;

const cleanupTimer = setInterval(() => {
  try {
    cleanupStaleSessions();
    const trimmed = trimSessionEvents();
    const db = getDB();
    // Always run WAL checkpoint to prevent WAL file from growing unbounded
    if (trimmed > 0) {
      const mode = trimmed > 100 ? "TRUNCATE" : "PASSIVE";
      db.run(`PRAGMA wal_checkpoint(${mode})`);
      console.log(`[Cleanup] trimmed ${trimmed} events, WAL checkpoint (${mode}) done`);
    } else {
      // Periodic passive checkpoint even without deletes
      db.run("PRAGMA wal_checkpoint(PASSIVE)");
    }
    // Memory watchdog: log, warn, and take action on high memory usage
    checkMemory();
  } catch (err) {
    console.error("[Cleanup] error:", err);
  }
}, CLEANUP_INTERVAL_MS);

console.log(`[Cleanup] scheduled every ${CLEANUP_INTERVAL_MS / 1000}s`);

// Cleanup on shutdown
const shutdown = () => {
  console.log("\nShutting down...");
  clearInterval(cleanupTimer);
  killAllProcesses();
  closeDB();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
