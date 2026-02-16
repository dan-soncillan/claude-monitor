import { getDB } from "../db/client";
import { clearRegexCache } from "./approval-engine";
import { broadcast } from "../ws/broadcaster";
import type { MemoryAlert } from "@claude-monitor/shared";

// Thresholds in MB
const WARN_RSS_MB = parseInt(process.env.MEMORY_WARN_MB || "256");
const CRITICAL_RSS_MB = parseInt(process.env.MEMORY_CRITICAL_MB || "512");
const FATAL_RSS_MB = parseInt(process.env.MEMORY_FATAL_MB || "1024");

let lastLoggedLevel: "ok" | "warn" | "critical" = "ok";

function sendAlert(level: MemoryAlert["level"], rssMB: number, heapMB: number, message: string): void {
  const alert: MemoryAlert = { level, rss_mb: Math.round(rssMB), heap_used_mb: Math.round(heapMB), message };

  // Notify all connected Web UI clients
  broadcast({
    type: "memory_alert",
    data: alert,
    timestamp: new Date().toISOString(),
  });

  // macOS desktop notification (fire-and-forget)
  if (process.platform === "darwin") {
    const sound = level === "fatal" ? ' sound name "Basso"' : level === "critical" ? ' sound name "default"' : "";
    const script = `display notification "${message}" with title "ClaudeMonitor" subtitle "Memory ${level.toUpperCase()}"${sound}`;
    try {
      Bun.spawn(["osascript", "-e", script], { stdout: "ignore", stderr: "ignore" });
    } catch { /* best effort */ }
  }
}

/**
 * Check process memory usage and take graduated action:
 * - WARN (256MB): log warning + notify
 * - CRITICAL (512MB): force GC, clear caches, WAL checkpoint + notify
 * - FATAL (1GB): notify + graceful shutdown to prevent system crash
 */
export function checkMemory(): void {
  const mem = process.memoryUsage();
  const rssMB = mem.rss / 1024 / 1024;
  const heapMB = mem.heapUsed / 1024 / 1024;

  if (rssMB >= FATAL_RSS_MB) {
    const message = `RSS ${rssMB.toFixed(0)}MB — ${FATAL_RSS_MB}MB超過。システム保護のためサーバーを停止します。`;
    console.error(`[Memory] FATAL: ${message}`);
    sendAlert("fatal", rssMB, heapMB, message);

    // Force cleanup before exit
    try {
      clearRegexCache();
      Bun.gc(true);
      const db = getDB();
      db.run("PRAGMA wal_checkpoint(TRUNCATE)");
    } catch { /* best effort */ }

    // Brief delay to allow WebSocket/notification delivery
    setTimeout(() => process.exit(1), 500);
    return;
  }

  if (rssMB >= CRITICAL_RSS_MB) {
    const message = `RSS ${rssMB.toFixed(0)}MB — ${CRITICAL_RSS_MB}MB超過。緊急クリーンアップを実行中...`;
    console.warn(`[Memory] CRITICAL: ${message}`);
    sendAlert("critical", rssMB, heapMB, message);

    // Clear internal caches
    clearRegexCache();

    // Force garbage collection
    Bun.gc(true);

    // Aggressive WAL checkpoint to free disk-backed memory
    try {
      const db = getDB();
      db.run("PRAGMA wal_checkpoint(TRUNCATE)");
      db.run("PRAGMA shrink_memory");
    } catch (err) {
      console.error("[Memory] DB cleanup error:", err);
    }

    // Log post-cleanup stats
    const after = process.memoryUsage();
    const freedMB = rssMB - after.rss / 1024 / 1024;
    console.warn(
      `[Memory] Post-cleanup: RSS ${(after.rss / 1024 / 1024).toFixed(0)}MB, ` +
      `Heap ${(after.heapUsed / 1024 / 1024).toFixed(0)}MB (freed ${freedMB.toFixed(0)}MB)`
    );
    lastLoggedLevel = "critical";
    return;
  }

  if (rssMB >= WARN_RSS_MB) {
    if (lastLoggedLevel !== "warn" && lastLoggedLevel !== "critical") {
      const message = `RSS ${rssMB.toFixed(0)}MB — ${WARN_RSS_MB}MB超過。メモリ使用量が増加しています。`;
      console.warn(`[Memory] WARNING: ${message}`);
      sendAlert("warn", rssMB, heapMB, message);
    }
    lastLoggedLevel = "warn";
    return;
  }

  // Back to normal
  if (lastLoggedLevel !== "ok") {
    console.log(`[Memory] OK: RSS ${rssMB.toFixed(0)}MB, Heap ${heapMB.toFixed(0)}MB`);
  }
  lastLoggedLevel = "ok";
}

/** Get current memory stats for diagnostics */
export function getMemoryStats() {
  const mem = process.memoryUsage();
  return {
    rss_mb: Math.round(mem.rss / 1024 / 1024),
    heap_used_mb: Math.round(mem.heapUsed / 1024 / 1024),
    heap_total_mb: Math.round(mem.heapTotal / 1024 / 1024),
    warn_threshold_mb: WARN_RSS_MB,
    critical_threshold_mb: CRITICAL_RSS_MB,
    fatal_threshold_mb: FATAL_RSS_MB,
  };
}
