import { useState } from "react";
import type { Approval } from "@claude-monitor/shared";
import { api } from "../hooks/useApi";

interface Props {
  approval: Approval;
}

export function ApprovalBanner({ approval }: Props) {
  const [loading, setLoading] = useState(false);
  const [reason, setReason] = useState("");

  const handleDecision = async (decision: "approved" | "rejected") => {
    setLoading(true);
    try {
      if (decision === "approved") {
        await api.approveApproval(approval.id, "web_user", reason || undefined);
      } else {
        await api.rejectApproval(approval.id, "web_user", reason || undefined);
      }
    } catch (e) {
      console.error("Failed to submit decision:", e);
    } finally {
      setLoading(false);
    }
  };

  if (approval.status !== "pending") return null;

  let toolInput = "";
  try {
    toolInput = JSON.stringify(JSON.parse(approval.tool_input), null, 2);
  } catch {
    toolInput = approval.tool_input;
  }

  return (
    <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg p-4 mb-3">
      <div className="flex items-start gap-3">
        <div className="text-orange-400 text-lg mt-0.5">⚠</div>
        <div className="flex-1">
          <div className="font-medium text-orange-300 text-sm">
            Approval Required
          </div>
          <div className="text-sm text-gray-300 mt-1">
            Tool: <code className="bg-gray-800 px-1.5 py-0.5 rounded">{approval.tool_name}</code>
          </div>
          {toolInput && (
            <pre className="text-xs text-gray-400 mt-2 bg-gray-900 p-2 rounded overflow-x-auto max-h-32">
              {toolInput}
            </pre>
          )}
          <div className="flex items-center gap-2 mt-3">
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Reason (optional)"
              className="flex-1 text-xs bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-gray-300 placeholder-gray-600 focus:outline-none focus:border-gray-500"
            />
            <button
              onClick={() => handleDecision("approved")}
              disabled={loading}
              className="px-3 py-1.5 text-xs font-medium rounded bg-green-600 hover:bg-green-500 text-white disabled:opacity-50 transition-colors"
            >
              Approve
            </button>
            <button
              onClick={() => handleDecision("rejected")}
              disabled={loading}
              className="px-3 py-1.5 text-xs font-medium rounded bg-red-600 hover:bg-red-500 text-white disabled:opacity-50 transition-colors"
            >
              Reject
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
