import { useEffect, useCallback, useState } from "react";
import { useSessionStore } from "../stores/sessionStore";
import { useSettingsStore } from "../stores/settingsStore";
import { SessionCard } from "./SessionCard";
import { EditorLink } from "./EditorLink";
import { ConfirmDialog } from "./ConfirmDialog";
import { api } from "../hooks/useApi";
import type { Session } from "@claude-monitor/shared";

/** Group sessions by project directory */
function groupByDirectory(sessions: Session[]): Map<string, Session[]> {
  const groups = new Map<string, Session[]>();
  for (const s of sessions) {
    const dir = s.cwd || "unknown";
    const projectName = dir.split("/").filter(Boolean).slice(-1)[0] || dir;
    if (!groups.has(projectName)) groups.set(projectName, []);
    groups.get(projectName)!.push(s);
  }
  for (const [, arr] of groups) {
    arr.sort((a, b) => a.id.localeCompare(b.id));
  }
  return groups;
}

function DirectoryHeader({ dir, count, cwd, onClear }: { dir: string; count?: number; cwd: string; onClear?: () => void }) {
  return (
    <div className="flex items-center gap-1.5 px-1 mb-1.5">
      <span className="text-[10px] text-gray-600 shrink-0">&#128193;</span>
      <span className="text-[11px] font-medium text-gray-300 truncate min-w-0">{dir}</span>
      {count != null && <span className="text-[10px] text-gray-600 shrink-0">({count})</span>}
      <span className="ml-auto shrink-0 flex items-center gap-1.5">
        <EditorLink cwd={cwd} />
        {onClear && (
          <button
            onClick={onClear}
            className="text-[10px] text-gray-700 hover:text-red-400 transition-colors"
            title={`Clear ${dir} completed sessions`}
          >
            Clear
          </button>
        )}
      </span>
    </div>
  );
}

export function SessionList() {
  const sessions = useSessionStore((s) => s.sessions);
  const selectedId = useSessionStore((s) => s.selectedSessionId);
  const setSessions = useSessionStore((s) => s.setSessions);
  const selectSession = useSessionStore((s) => s.selectSession);
  const isUnseen = useSessionStore((s) => s.isUnseen);
  const autoOpen = useSettingsStore((s) => s.autoOpenEditorOnWaitingInput);
  const autoOpenOnClick = useSettingsStore((s) => s.autoOpenEditorOnClick);
  const editor = useSettingsStore((s) => s.editor);

  useEffect(() => {
    api.getSessions().then(setSessions).catch(console.error);
  }, [setSessions]);

  const handleSessionClick = useCallback(
    (session: Session) => {
      selectSession(session.id);
      const shouldOpen =
        (autoOpen && session.status === "waiting_input") ||
        (autoOpenOnClick && session.status !== "waiting_input");
      if (shouldOpen && session.cwd) {
        const url = `${editor}://file${session.cwd}`;
        const a = document.createElement("a");
        a.href = url;
        a.click();
      }
    },
    [selectSession, autoOpen, autoOpenOnClick, editor],
  );

  const active = sessions.filter(
    (s) => s.status !== "completed" && s.status !== "error"
  );
  const inactive = sessions.filter(
    (s) => s.status === "completed" || s.status === "error"
  );

  const activeGroups = groupByDirectory(active);
  const inactiveGroups = groupByDirectory(inactive);

  // clearTarget: null = all, string = specific cwd
  const [clearTarget, setClearTarget] = useState<string | null | undefined>(undefined);
  const showClearConfirm = clearTarget !== undefined;

  const handleClearCompleted = useCallback((cwd?: string) => {
    const cwds = cwd
      ? [cwd]
      : [...new Set(inactive.map((s) => s.cwd).filter(Boolean))] as string[];
    Promise.all(
      cwds.map((c) => api.deleteSessionsByStatus("completed", c))
    )
      .then(() => api.getSessions())
      .then(setSessions)
      .catch(console.error);
    setClearTarget(undefined);
  }, [setSessions, inactive]);

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-gray-800">
        <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">
          Sessions ({sessions.length})
        </h2>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {/* Active sessions grouped by directory */}
        {activeGroups.size > 0 && (
          <div>
            <div className="text-xs font-medium text-gray-500 uppercase px-1 mb-2">
              Active ({active.length})
            </div>
            {[...activeGroups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([dir, dirSessions]) => (
              <div key={dir} className="mb-3">
                <DirectoryHeader dir={dir} count={dirSessions.length} cwd={dirSessions[0].cwd} />
                <div className="space-y-1.5 pl-1">
                  {dirSessions.map((s) => (
                    <SessionCard
                      key={s.id}
                      session={s}
                      selected={selectedId === s.id}
                      unseen={isUnseen(s.id)}
                      onClick={() => handleSessionClick(s)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Completed sessions grouped by directory */}
        {inactiveGroups.size > 0 && (
          <div>
            <div className="flex items-center justify-between px-1 mb-2">
              <span className="text-xs font-medium text-gray-500 uppercase">
                Completed ({inactive.length})
              </span>
              <button
                onClick={() => setClearTarget(null)}
                className="text-[10px] text-gray-600 hover:text-red-400 transition-colors"
                title="Clear all completed sessions"
              >
                Clear all
              </button>
            </div>
            {[...inactiveGroups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([dir, dirSessions]) => (
              <div key={dir} className="mb-3">
                <DirectoryHeader dir={dir} cwd={dirSessions[0].cwd} onClear={() => setClearTarget(dirSessions[0].cwd)} />
                <div className="space-y-1.5 pl-1">
                  {dirSessions.map((s) => (
                    <SessionCard
                      key={s.id}
                      session={s}
                      selected={selectedId === s.id}
                      unseen={isUnseen(s.id)}
                      onClick={() => handleSessionClick(s)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {sessions.length === 0 && (
          <div className="text-center text-gray-600 py-8 text-sm">
            No sessions yet.
            <br />
            Start a Claude Code session with hooks enabled.
          </div>
        )}
      </div>

      {showClearConfirm && (() => {
        const targetCwd = clearTarget;
        const targetSessions = targetCwd
          ? inactive.filter((s) => s.cwd === targetCwd)
          : inactive;
        const targetName = targetCwd
          ? targetCwd.split("/").filter(Boolean).slice(-1)[0] || targetCwd
          : null;
        return (
          <ConfirmDialog
            title={targetName
              ? `${targetName} の完了済みセッションを削除しますか？`
              : "完了済みセッションをすべて削除しますか？"}
            message={`${targetSessions.length} 件の完了済みセッションを削除します。履歴も完全に消去されます。`}
            confirmLabel="削除"
            cancelLabel="キャンセル"
            onConfirm={() => handleClearCompleted(targetCwd ?? undefined)}
            onCancel={() => setClearTarget(undefined)}
          />
        );
      })()}
    </div>
  );
}
