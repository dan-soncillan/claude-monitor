export type EventType =
  | "session_start"
  | "session_end"
  | "pre_tool_use"
  | "post_tool_use"
  | "notification"
  | "stop"
  | "input_request"
  | "user_prompt";

export interface Event {
  id: number;
  session_id: string;
  event_type: EventType;
  tool_name?: string;
  tool_input?: string;
  tool_response?: string;
  summary?: string;
  created_at: string;
}

export interface EventCreate {
  session_id: string;
  event_type: EventType;
  tool_name?: string;
  tool_input?: unknown;
  tool_response?: unknown;
  summary?: string;
  cwd?: string;
}
