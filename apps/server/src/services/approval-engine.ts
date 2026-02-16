import { getDB } from "../db/client";
import { broadcast } from "../ws/broadcaster";
import type {
  ApprovalRule,
  ApprovalRuleAction,
  Approval,
  Event,
} from "@claude-monitor/shared";

// Cache compiled regexes to avoid re-compiling on every tool invocation
const regexCache = new Map<string, RegExp>();

function getCachedRegex(pattern: string): RegExp {
  let regex = regexCache.get(pattern);
  if (!regex) {
    regex = new RegExp(pattern);
    regexCache.set(pattern, regex);
  }
  return regex;
}

/** Clear regex cache when rules are modified */
export function clearRegexCache(): void {
  regexCache.clear();
}

/**
 * Check if a pre_tool_use event matches any approval rules.
 * Returns the action to take, or null if no rules match.
 */
export function matchApprovalRules(
  toolName: string,
  toolInput: string
): { action: ApprovalRuleAction; rule: ApprovalRule } | null {
  const db = getDB();
  const rules = db
    .query("SELECT * FROM approval_rules ORDER BY id")
    .all() as ApprovalRule[];

  for (const rule of rules) {
    try {
      const toolMatch = getCachedRegex(rule.tool_pattern).test(toolName);
      if (!toolMatch) continue;

      if (rule.input_pattern) {
        const inputMatch = getCachedRegex(rule.input_pattern).test(toolInput);
        if (!inputMatch) continue;
      }

      return { action: rule.action, rule };
    } catch {
      // Skip rules with invalid regex patterns
      continue;
    }
  }

  return null;
}

/**
 * Process a pre_tool_use event: check rules and create approval if needed.
 * Returns the created approval if one was created, null otherwise.
 */
export function processPreToolUse(event: Event): Approval | null {
  if (event.event_type !== "pre_tool_use" || !event.tool_name) {
    return null;
  }

  const match = matchApprovalRules(event.tool_name, event.tool_input || "");

  if (!match) return null;

  if (match.action === "auto_approve") return null;

  if (match.action === "auto_deny") {
    // Create auto-denied approval
    const db = getDB();
    const approval = db
      .query(
        `INSERT INTO approvals (session_id, event_id, tool_name, tool_input, status, decided_by, decided_at)
         VALUES (?, ?, ?, ?, 'rejected', 'auto_rule', datetime('now'))
         RETURNING *`
      )
      .get(
        event.session_id,
        event.id,
        event.tool_name,
        event.tool_input || ""
      ) as Approval;

    broadcast({
      type: "approval_updated",
      data: approval,
      timestamp: new Date().toISOString(),
    });

    return approval;
  }

  // require_approval: create pending approval
  // Session status update is handled by events.ts (single source of truth)
  const db = getDB();

  const approval = db
    .query(
      `INSERT INTO approvals (session_id, event_id, tool_name, tool_input, status)
       VALUES (?, ?, ?, ?, 'pending')
       RETURNING *`
    )
    .get(
      event.session_id,
      event.id,
      event.tool_name,
      event.tool_input || ""
    ) as Approval;

  broadcast({
    type: "approval_created",
    data: approval,
    timestamp: new Date().toISOString(),
  });

  return approval;
}
