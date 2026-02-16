import { getDB } from "../db/client";

export interface ServerSettings {
  macNotifications: boolean;
  macNotificationSound: boolean;
  editor: "cursor" | "vscode";
}

const DEFAULTS: ServerSettings = {
  macNotifications: false,
  macNotificationSound: true,
  editor: "cursor",
};

export function getSetting<K extends keyof ServerSettings>(key: K): ServerSettings[K] {
  const db = getDB();
  const row = db.query("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | null;
  if (!row) return DEFAULTS[key];
  try {
    return JSON.parse(row.value);
  } catch {
    return row.value as ServerSettings[K];
  }
}

export function setSetting<K extends keyof ServerSettings>(key: K, value: ServerSettings[K]): void {
  const db = getDB();
  const serialized = JSON.stringify(value);
  db.query(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = datetime('now')`
  ).run(key, serialized, serialized);
}

export function getAllSettings(): ServerSettings {
  const db = getDB();
  const rows = db.query("SELECT key, value FROM settings").all() as { key: string; value: string }[];
  const result = { ...DEFAULTS };
  for (const row of rows) {
    if (row.key in result) {
      try {
        (result as any)[row.key] = JSON.parse(row.value);
      } catch {
        (result as any)[row.key] = row.value;
      }
    }
  }
  return result;
}

export function updateSettings(partial: Partial<ServerSettings>): ServerSettings {
  for (const [key, value] of Object.entries(partial)) {
    if (key in DEFAULTS) {
      setSetting(key as keyof ServerSettings, value as any);
    }
  }
  return getAllSettings();
}
