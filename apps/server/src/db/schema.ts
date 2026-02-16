import { Database } from "bun:sqlite";

export function initDB(dbPath = "claude-monitor.db"): Database {
  const db = new Database(dbPath, { create: true });

  // Enable WAL mode for concurrent reads
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  // Auto-checkpoint every 1000 pages to prevent WAL file from growing unbounded
  db.exec("PRAGMA wal_autocheckpoint = 1000");

  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'idle'
        CHECK(status IN ('idle', 'running', 'waiting_input', 'completed', 'error')),
      cwd TEXT NOT NULL DEFAULT '',
      task_description TEXT,
      last_activity TEXT,
      waiting_context TEXT,
      model TEXT,
      slack_thread_ts TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL REFERENCES sessions(id),
      event_type TEXT NOT NULL
        CHECK(event_type IN ('session_start', 'session_end', 'pre_tool_use', 'post_tool_use', 'notification', 'stop', 'input_request', 'user_prompt')),
      tool_name TEXT,
      tool_input TEXT,
      tool_response TEXT,
      summary TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS approvals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL REFERENCES sessions(id),
      event_id INTEGER NOT NULL REFERENCES events(id),
      tool_name TEXT NOT NULL,
      tool_input TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK(status IN ('pending', 'approved', 'rejected', 'timeout')),
      decided_by TEXT,
      decision_reason TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      decided_at TEXT
    );

    CREATE TABLE IF NOT EXISTS approval_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tool_pattern TEXT NOT NULL,
      input_pattern TEXT,
      action TEXT NOT NULL DEFAULT 'require_approval'
        CHECK(action IN ('require_approval', 'auto_approve', 'auto_deny')),
      description TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_events_session_id ON events(session_id);
    CREATE INDEX IF NOT EXISTS idx_approvals_session_id ON approvals(session_id);
    CREATE INDEX IF NOT EXISTS idx_approvals_status ON approvals(status);
  `);

  // Migrations for existing databases
  try {
    db.exec("ALTER TABLE sessions ADD COLUMN last_activity TEXT");
  } catch { /* already exists */ }

  // Add waiting_context column
  try {
    db.exec("ALTER TABLE sessions ADD COLUMN waiting_context TEXT");
  } catch { /* already exists */ }

  // Add read_at column for cross-tab read state synchronization
  try {
    db.exec("ALTER TABLE sessions ADD COLUMN read_at TEXT");
  } catch { /* already exists */ }

  // Add notes column for session memos
  try {
    db.exec("ALTER TABLE sessions ADD COLUMN notes TEXT");
  } catch { /* already exists */ }

  // Add cost tracking columns (populated via status line)
  try {
    db.exec("ALTER TABLE sessions ADD COLUMN cost_usd REAL");
  } catch { /* already exists */ }
  try {
    db.exec("ALTER TABLE sessions ADD COLUMN cost_duration_ms INTEGER");
  } catch { /* already exists */ }
  try {
    db.exec("ALTER TABLE sessions ADD COLUMN cost_api_duration_ms INTEGER");
  } catch { /* already exists */ }
  try {
    db.exec("ALTER TABLE sessions ADD COLUMN total_input_tokens INTEGER");
  } catch { /* already exists */ }
  try {
    db.exec("ALTER TABLE sessions ADD COLUMN total_output_tokens INTEGER");
  } catch { /* already exists */ }
  try {
    db.exec("ALTER TABLE sessions ADD COLUMN context_used_pct REAL");
  } catch { /* already exists */ }

  // Migrate waiting_approval → waiting_input
  db.exec("UPDATE sessions SET status = 'waiting_input' WHERE status = 'waiting_approval'");

  // Migrate sessions table: ensure CHECK constraint includes 'idle' and excludes 'waiting_approval'
  try {
    db.exec("INSERT INTO sessions (id, status, cwd) VALUES ('__migration_test__', 'idle', '')");
    db.exec("DELETE FROM sessions WHERE id = '__migration_test__'");
  } catch {
    db.exec("PRAGMA foreign_keys = OFF");
    db.exec("DROP TABLE IF EXISTS sessions_new");
    db.exec(`
      CREATE TABLE sessions_new (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL DEFAULT 'idle'
          CHECK(status IN ('idle', 'running', 'waiting_input', 'completed', 'error')),
        cwd TEXT NOT NULL DEFAULT '',
        task_description TEXT,
        last_activity TEXT,
        waiting_context TEXT,
        model TEXT,
        slack_thread_ts TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO sessions_new SELECT * FROM sessions;
      DROP TABLE sessions;
      ALTER TABLE sessions_new RENAME TO sessions;
    `);
    db.exec("PRAGMA foreign_keys = ON");
  }

  // Migrate events table: add 'user_prompt' to CHECK constraint
  try {
    db.exec("INSERT INTO events (session_id, event_type) VALUES ('__test__', 'user_prompt')");
    db.exec("DELETE FROM events WHERE session_id = '__test__'");
  } catch {
    db.exec("PRAGMA foreign_keys = OFF");
    db.exec("DROP TABLE IF EXISTS events_new");
    db.exec(`
      CREATE TABLE events_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL REFERENCES sessions(id),
        event_type TEXT NOT NULL,
        tool_name TEXT, tool_input TEXT, tool_response TEXT, summary TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO events_new SELECT * FROM events;
      DROP TABLE events;
      ALTER TABLE events_new RENAME TO events;
      CREATE INDEX IF NOT EXISTS idx_events_session_id ON events(session_id);
    `);
    db.exec("PRAGMA foreign_keys = ON");
  }

  return db;
}
