export type SessionStatus =
  | "idle"
  | "running"
  | "waiting_input"
  | "completed"
  | "error";

export interface Session {
  id: string;
  status: SessionStatus;
  cwd: string;
  task_description?: string;
  last_activity?: string;
  waiting_context?: string;
  model?: string;
  slack_thread_ts?: string;
  notes?: string;
  read_at?: string;
  created_at: string;
  updated_at: string;
}

export interface SessionCreate {
  session_id: string;
  cwd: string;
  task_description?: string;
  model?: string;
}
