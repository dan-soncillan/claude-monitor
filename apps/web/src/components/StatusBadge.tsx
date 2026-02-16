import type { SessionStatus } from "@claude-monitor/shared";

const statusConfig: Record<SessionStatus, { label: string; class: string }> = {
  idle: { label: "Idle", class: "bg-gray-500/20 text-gray-500 border-gray-600/30" },
  running: { label: "Running", class: "bg-green-500/20 text-green-400 border-green-500/30" },
  waiting_input: { label: "Waiting Input", class: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" },
  completed: { label: "Completed", class: "bg-gray-500/20 text-gray-400 border-gray-500/30" },
  error: { label: "Error", class: "bg-red-500/20 text-red-400 border-red-500/30" },
};

export function StatusBadge({ status }: { status: SessionStatus }) {
  const config = statusConfig[status] || statusConfig.running;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${config.class}`}>
      {status === "running" && (
        <span className="w-1.5 h-1.5 rounded-full bg-green-400 mr-1.5 animate-pulse" />
      )}
      {status === "waiting_input" && (
        <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 mr-1.5 animate-pulse" />
      )}
      {config.label}
    </span>
  );
}
