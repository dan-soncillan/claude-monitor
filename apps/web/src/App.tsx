import { useState } from "react";
import { useWebSocket } from "./hooks/useWebSocket";
import { SessionList } from "./components/SessionList";
import { SessionDetail } from "./components/SessionDetail";
import { SettingsDialog } from "./components/SettingsDialog";
import { MemoryAlertBanner } from "./components/MemoryAlertBanner";
import { useMonthlyCostStore } from "./stores/monthlyCostStore";
import { useCostFormat } from "./hooks/useCostFormat";

export default function App() {
  useWebSocket();
  const [showSettings, setShowSettings] = useState(false);
  const currentMonthCost = useMonthlyCostStore((s) => s.currentMonthCost);
  const formatCost = useCostFormat();

  return (
    <div className="h-screen flex flex-col bg-gray-950 text-gray-100">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-gray-800 bg-gray-950">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold text-gray-100">ClaudeMonitor</h1>
          <span className="text-xs text-gray-600">Session Dashboard</span>
        </div>
        <div className="flex items-center gap-3">
          {currentMonthCost && currentMonthCost.total_cost_usd > 0 && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-950/30 border border-emerald-800/40 rounded-lg">
              <span className="text-xs text-emerald-400/80">💰</span>
              <span className="text-sm font-mono text-emerald-400">
                {formatCost(currentMonthCost.total_cost_usd, "detail")}
              </span>
              <span className="text-xs text-gray-500">monthly</span>
            </div>
          )}
          <button
            onClick={() => setShowSettings(true)}
            className="p-1.5 text-gray-500 hover:text-gray-300 transition-colors rounded-lg hover:bg-gray-800"
            title="Settings"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4.5 h-4.5">
              <path fillRule="evenodd" d="M8.34 1.804A1 1 0 0 1 9.32 1h1.36a1 1 0 0 1 .98.804l.295 1.473c.497.144.971.342 1.416.587l1.25-.834a1 1 0 0 1 1.262.125l.962.962a1 1 0 0 1 .125 1.262l-.834 1.25c.245.445.443.919.587 1.416l1.473.295a1 1 0 0 1 .804.98v1.361a1 1 0 0 1-.804.98l-1.473.295a6.95 6.95 0 0 1-.587 1.416l.834 1.25a1 1 0 0 1-.125 1.262l-.962.962a1 1 0 0 1-1.262.125l-1.25-.834a6.953 6.953 0 0 1-1.416.587l-.295 1.473a1 1 0 0 1-.98.804H9.32a1 1 0 0 1-.98-.804l-.295-1.473a6.957 6.957 0 0 1-1.416-.587l-1.25.834a1 1 0 0 1-1.262-.125l-.962-.962a1 1 0 0 1-.125-1.262l.834-1.25a6.957 6.957 0 0 1-.587-1.416l-1.473-.295A1 1 0 0 1 1 10.68V9.32a1 1 0 0 1 .804-.98l1.473-.295c.144-.497.342-.971.587-1.416l-.834-1.25a1 1 0 0 1 .125-1.262l.962-.962A1 1 0 0 1 5.38 3.03l1.25.834a6.957 6.957 0 0 1 1.416-.587l.295-1.473ZM13 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      </header>

      {/* Memory alerts */}
      <MemoryAlertBanner />

      {/* Main layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <aside className="w-72 border-r border-gray-800 flex-shrink-0 overflow-hidden">
          <SessionList />
        </aside>

        {/* Detail */}
        <main className="flex-1 overflow-hidden">
          <SessionDetail />
        </main>
      </div>

      {/* Dialogs */}
      {showSettings && <SettingsDialog onClose={() => setShowSettings(false)} />}
    </div>
  );
}
