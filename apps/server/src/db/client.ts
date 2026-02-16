import { Database } from "bun:sqlite";
import { initDB } from "./schema";

let db: Database | null = null;

export function getDB(): Database {
  if (!db) {
    const dbPath = process.env.DB_PATH || "claude-monitor.db";
    db = initDB(dbPath);
  }
  return db;
}

export function closeDB(): void {
  if (db) {
    db.close();
    db = null;
  }
}
