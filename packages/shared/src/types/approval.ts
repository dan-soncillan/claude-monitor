export type ApprovalStatus = "pending" | "approved" | "rejected" | "timeout";

export interface Approval {
  id: number;
  session_id: string;
  event_id: number;
  tool_name: string;
  tool_input: string;
  status: ApprovalStatus;
  decided_by?: string;
  decision_reason?: string;
  created_at: string;
  decided_at?: string;
}

export interface ApprovalDecision {
  status: "approved" | "rejected";
  decided_by: string;
  decision_reason?: string;
}

export type ApprovalRuleAction = "require_approval" | "auto_approve" | "auto_deny";

export interface ApprovalRule {
  id: number;
  tool_pattern: string;
  input_pattern?: string;
  action: ApprovalRuleAction;
  description?: string;
  created_at: string;
}

export interface ApprovalRuleCreate {
  tool_pattern: string;
  input_pattern?: string;
  action: ApprovalRuleAction;
  description?: string;
}
