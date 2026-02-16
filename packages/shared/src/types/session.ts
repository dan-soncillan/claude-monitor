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

  // Cost tracking (populated via status line)
  cost_usd?: number;
  cost_duration_ms?: number;
  cost_api_duration_ms?: number;
  total_input_tokens?: number;
  total_output_tokens?: number;
  context_used_pct?: number;
}

export interface SessionCostUpdate {
  cost_usd: number;
  cost_duration_ms?: number;
  cost_api_duration_ms?: number;
  total_input_tokens?: number;
  total_output_tokens?: number;
  context_used_pct?: number;
}

export interface SessionCreate {
  session_id: string;
  cwd: string;
  task_description?: string;
  model?: string;
}
