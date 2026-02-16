import { useAlertStore } from "../stores/alertStore";

const LEVEL_STYLES = {
  warn: "bg-yellow-900/80 border-yellow-700 text-yellow-200",
  critical: "bg-orange-900/80 border-orange-700 text-orange-200",
  fatal: "bg-red-900/80 border-red-700 text-red-200",
} as const;

const LEVEL_LABELS = {
  warn: "WARNING",
  critical: "CRITICAL",
  fatal: "FATAL",
} as const;

export function MemoryAlertBanner() {
  const alerts = useAlertStore((s) => s.alerts);
  const dismissAlert = useAlertStore((s) => s.dismissAlert);

  if (alerts.length === 0) return null;

  return (
    <div className="flex flex-col gap-1 px-4 py-1">
      {alerts.map((alert) => (
        <div
          key={alert.id}
          className={`flex items-center justify-between gap-3 px-3 py-2 rounded border text-sm ${LEVEL_STYLES[alert.level]}`}
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-bold text-xs shrink-0">
              {LEVEL_LABELS[alert.level]}
            </span>
            <span className="truncate">{alert.message}</span>
          </div>
          <button
            onClick={() => dismissAlert(alert.id)}
            className="shrink-0 opacity-60 hover:opacity-100 transition-opacity"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}
