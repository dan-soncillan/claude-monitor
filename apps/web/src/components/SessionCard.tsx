import type { Session } from "@claude-monitor/shared";
import { StatusBadge } from "./StatusBadge";

interface Props {
  session: Session;
  selected: boolean;
  unseen?: boolean;
  onClick: () => void;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr + "Z").getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function SessionCard({ session, selected, unseen, onClick }: Props) {
  const shortId = session.id.slice(0, 8);

  const borderClass = selected
    ? "bg-blue-500/10 border-blue-500/30"
    : unseen
      ? "bg-emerald-950/40 border-emerald-400/50 shadow-[0_0_12px_rgba(16,185,129,0.25)]"
      : "bg-gray-900 border-gray-800 hover:border-gray-700";

  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-3 rounded-lg border transition-colors ${borderClass}`}
    >
      {/* Row 1: Status badge + ID + cost + time */}
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <StatusBadge status={session.status} />
          <code className="text-[10px] text-gray-600 font-mono">{shortId}</code>
        </div>
        <div className="flex items-center gap-1.5">
          {session.cost_usd != null && session.cost_usd > 0 && (
            <span className="text-[10px] text-emerald-500/70 font-mono">
              ${session.cost_usd.toFixed(2)}
            </span>
          )}
          <span className="text-[10px] text-gray-600">
            {timeAgo(session.updated_at)}
          </span>
        </div>
      </div>

      {/* Row 2: Task prompt (what the user asked) */}
      {session.task_description && (
        <div
          className="text-xs text-gray-300 leading-relaxed line-clamp-2 mb-1"
          title={session.task_description}
        >
          {session.task_description}
        </div>
      )}

      {/* Row 3: Last activity (what Claude is doing now) */}
      {session.last_activity && (
        <div
          className="text-[11px] text-emerald-400/80 truncate"
          title={session.last_activity}
        >
          &#x25B6; {session.last_activity}
        </div>
      )}

      {/* Fallback if no info */}
      {!session.task_description && !session.last_activity && (
        <div className="text-xs text-gray-600 italic">No activity yet</div>
      )}
    </button>
  );
}
