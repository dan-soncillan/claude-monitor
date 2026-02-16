export type SessionStatus =
  | "idle"
  | "running"
  | "waiting_input"
  | "completed"
  | "error";

export interface TerminalInfo {
  type: "tmux" | "screen" | "wezterm" | "other";
  session_id: string;
  pane_id?: string;
}

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
  reviewed_at?: string;
  terminal_info?: TerminalInfo | null;
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

export interface MonthlyCost {
  month: string;
  total_cost_usd: number;
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_tokens?: number;
  cache_read_tokens?: number;
  total_tokens?: number;
  updated_at: string;
}

export interface MonthlyCostUpdate {
  month: string;
  totalCost: number;
  inputTokens?: number;
  outputTokens?: number;
  cacheCreationTokens?: number;
  cacheReadTokens?: number;
  totalTokens?: number;
}
