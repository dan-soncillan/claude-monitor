import type { Session, MonthlyCost } from "./session";
import type { Event } from "./event";
import type { Approval } from "./approval";

export type WSMessageType =
  | "session_updated"
  | "session_deleted"
  | "sessions_sync"
  | "event_created"
  | "approval_created"
  | "approval_updated"
  | "cli_output"
  | "memory_alert"
  | "monthly_cost_updated"
  | "connected";

export interface WSMessage {
  type: WSMessageType;
  data: Session | Session[] | Event | Approval | CLIOutput | MemoryAlert | MonthlyCost | ConnectionInfo | { id: string };
  timestamp: string;
}

export interface MemoryAlert {
  level: "warn" | "critical" | "fatal";
  rss_mb: number;
  heap_used_mb: number;
  message: string;
}

export interface CLIOutput {
  session_id: string;
  command_id: string;
  output: string;
  is_complete: boolean;
}

export interface ConnectionInfo {
  message: string;
}
