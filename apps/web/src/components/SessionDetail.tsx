import { useCallback, useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { CLIOutput } from "@claude-monitor/shared";
import { useSessionStore } from "../stores/sessionStore";
import { useEventStore } from "../stores/eventStore";
import { useApprovalStore } from "../stores/approvalStore";
import { StatusBadge } from "./StatusBadge";
import { EventTimeline } from "./EventTimeline";
import { ApprovalBanner } from "./ApprovalBanner";
import { EditorLink } from "./EditorLink";
import { ConfirmDialog } from "./ConfirmDialog";
import { api } from "../hooks/useApi";
import { useCostFormat } from "../hooks/useCostFormat";

/** Copy text and show brief feedback */
function CopyButton({ text, label }: { text: string; label: string }) {
  const handleCopy = () => {
    navigator.clipboard.writeText(text);
  };
  return (
    <button
      onClick={handleCopy}
      className="text-[11px] text-blue-400 hover:text-blue-300 bg-blue-950/30 border border-blue-900/30 rounded px-2 py-1 transition-colors"
      title={`Copy: ${text}`}
    >
      {label}
    </button>
  );
}

const waitingContextComponents = {
  h1: ({ children }: any) => <h1 className="text-lg font-bold text-gray-100 mt-3 mb-1.5 border-b border-yellow-800/40 pb-1">{children}</h1>,
  h2: ({ children }: any) => <h2 className="text-base font-bold text-gray-100 mt-2.5 mb-1">{children}</h2>,
  h3: ({ children }: any) => <h3 className="text-sm font-semibold text-gray-200 mt-2 mb-1">{children}</h3>,
  p: ({ children }: any) => <p className="my-1 leading-relaxed">{children}</p>,
  strong: ({ children }: any) => <strong className="text-yellow-300 font-semibold">{children}</strong>,
  code: ({ children, className }: any) => {
    const isBlock = className?.startsWith("language-");
    if (isBlock) return <code className="text-[11px]">{children}</code>;
    return <code className="bg-gray-800 text-emerald-300 px-1 py-0.5 rounded text-[11px]">{children}</code>;
  },
  pre: ({ children }: any) => <pre className="bg-gray-900/80 border border-gray-800 rounded p-2 my-1.5 overflow-x-auto text-[11px] text-gray-300">{children}</pre>,
  ul: ({ children }: any) => <ul className="pl-4 my-1 space-y-0.5 list-disc marker:text-gray-500">{children}</ul>,
  ol: ({ children }: any) => <ol className="pl-4 my-1 space-y-0.5 list-decimal marker:text-gray-400">{children}</ol>,
  li: ({ children }: any) => <li className="leading-relaxed">{children}</li>,
  hr: () => <hr className="border-yellow-800/30 my-2" />,
};

function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}k`;
  return String(tokens);
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (minutes < 60) return `${minutes}m ${secs}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

export function SessionDetail() {
  const selectedId = useSessionStore((s) => s.selectedSessionId);
  const sessions = useSessionStore((s) => s.sessions);
  const removeSession = useSessionStore((s) => s.removeSession);
  const events = useEventStore((s) => s.events);
  const setEvents = useEventStore((s) => s.setEvents);
  const approvals = useApprovalStore((s) => s.approvals);
  const setApprovals = useApprovalStore((s) => s.setApprovals);

  const formatCost = useCostFormat();
  const session = sessions.find((s) => s.id === selectedId);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [contextCollapsed, setContextCollapsed] = useState(session?.status !== "waiting_input");

  // Prompt input state
  const [promptInput, setPromptInput] = useState("");
  const [isSendingPrompt, setIsSendingPrompt] = useState(false);
  const [cliOutputs, setCliOutputs] = useState<CLIOutput[]>([]);
  const [currentCommandId, setCurrentCommandId] = useState<string | null>(null);

  // Notes state
  const [notesText, setNotesText] = useState(session?.notes || "");
  const [notesCollapsed, setNotesCollapsed] = useState(true);
  const notesTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notesSessionIdRef = useRef<string | null>(null);

  // Debounced save for notes
  const saveNotes = useCallback((sessionId: string, text: string) => {
    if (notesTimerRef.current) clearTimeout(notesTimerRef.current);
    notesTimerRef.current = setTimeout(() => {
      api.updateNotes(sessionId, text).catch(console.error);
    }, 1000);
  }, []);

  // Sync notes when session changes
  useEffect(() => {
    if (notesTimerRef.current) clearTimeout(notesTimerRef.current);
    notesSessionIdRef.current = selectedId || null;
    setNotesText(session?.notes || "");
    setNotesCollapsed(true);
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (notesTimerRef.current) clearTimeout(notesTimerRef.current);
    };
  }, []);

  // Reset collapse state when switching sessions
  useEffect(() => {
    if (session) {
      setContextCollapsed(session.status !== "waiting_input");
    }
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-collapse when session leaves waiting_input, auto-expand when entering
  const prevStatusRef = useRef(session?.status);
  useEffect(() => {
    if (!session) return;
    const prev = prevStatusRef.current;
    if (prev === "waiting_input" && session.status !== "waiting_input") {
      setContextCollapsed(true);
    } else if (session.status === "waiting_input") {
      setContextCollapsed(false);
    }
    prevStatusRef.current = session.status;
  }, [session?.status]);

  const clearEvents = useEventStore((s) => s.clearEvents);

  useEffect(() => {
    if (!selectedId) {
      clearEvents();
      setCliOutputs([]);
      setCurrentCommandId(null);
      return;
    }
    // Clear previous session's events before loading new ones
    clearEvents();
    setCliOutputs([]);
    setCurrentCommandId(null);
    api.getSessionEvents(selectedId).then(setEvents).catch(console.error);
    api.getApprovals().then(setApprovals).catch(console.error);
    // Mark as read — syncs across all tabs/browsers via WebSocket
    api.markRead(selectedId).catch(console.error);
  }, [selectedId, setEvents, setApprovals, clearEvents]);

  // Listen to WebSocket for CLI output
  useEffect(() => {
    if (!selectedId) return;

    const handleMessage = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "cli_output") {
          const cliOutput = msg.data as CLIOutput;
          if (cliOutput.session_id === selectedId) {
            setCliOutputs((prev) => [...prev, cliOutput]);
          }
        }
      } catch (e) {
        // Ignore parse errors
      }
    };

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    const ws = new WebSocket(wsUrl);

    ws.addEventListener("message", handleMessage);

    return () => {
      ws.removeEventListener("message", handleMessage);
      ws.close();
    };
  }, [selectedId]);

  if (!selectedId || !session) {
    return (
      <div className="flex items-center justify-center h-full text-gray-600">
        <div className="text-center">
          <div className="text-4xl mb-2">&#8592;</div>
          <div>Select a session to view details</div>
        </div>
      </div>
    );
  }

  const sessionApprovals = approvals.filter(
    (a) => a.session_id === selectedId
  );
  const pendingApprovals = sessionApprovals.filter(
    (a) => a.status === "pending"
  );

  const isActive = session.status === "running" || session.status === "idle" || session.status === "waiting_input";

  const handleDelete = () => {
    api.deleteSession(session.id).then(() => removeSession(session.id)).catch(console.error);
    setShowDeleteConfirm(false);
  };

  const handleMarkCompleted = () => {
    api.completeSession(session.id).catch(console.error);
  };

  const handleMarkReviewed = () => {
    api.markReviewed(session.id).catch(console.error);
  };

  const handleSendPrompt = async () => {
    if (!session || !promptInput.trim() || isSendingPrompt) return;

    setIsSendingPrompt(true);
    try {
      const result = await api.sendInstruction(session.id, promptInput.trim());
      setCurrentCommandId(result.command_id);
      setPromptInput("");
    } catch (error) {
      console.error("Failed to send prompt:", error);
      alert(`Failed to send prompt: ${error}`);
    } finally {
      setIsSendingPrompt(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-gray-800">
        {/* Directory path - prominent */}
        <div className="flex items-center gap-2.5 mb-3 text-sm text-gray-300 font-mono bg-gray-800/60 rounded-lg px-3 py-2.5">
          <span className="text-gray-400 text-base shrink-0">&#128193;</span>
          <span className="truncate flex-1" title={session.cwd}>{session.cwd || "unknown"}</span>
          <EditorLink cwd={session.cwd} terminalInfo={session.terminal_info} />
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={session.status} />
          <div className="flex-1 min-w-0">
            {session.task_description ? (
              <div className="text-sm text-gray-200 truncate">
                {session.task_description}
              </div>
            ) : (
              <div className="text-sm text-gray-500 italic">No task description</div>
            )}
            <div className="flex items-center gap-3 mt-1 text-[11px] text-gray-500">
              <code className="font-mono">{session.id.slice(0, 8)}</code>
              {session.model && (
                <>
                  <span className="text-gray-700">|</span>
                  <span>{session.model}</span>
                </>
              )}
            </div>
            {session.cost_usd != null && session.cost_usd > 0 && (
              <div className="flex items-center gap-3 mt-1 text-[11px] text-gray-500">
                <span className="text-emerald-400 font-mono">
                  {formatCost(session.cost_usd, "detail")}
                </span>
                {session.total_input_tokens != null && (
                  <>
                    <span className="text-gray-700">|</span>
                    <span>
                      {formatTokens(session.total_input_tokens)} in
                      {session.total_output_tokens != null &&
                        ` / ${formatTokens(session.total_output_tokens)} out`}
                    </span>
                  </>
                )}
                {session.context_used_pct != null && (
                  <>
                    <span className="text-gray-700">|</span>
                    <span className={
                      session.context_used_pct >= 90 ? "text-red-400" :
                      session.context_used_pct >= 70 ? "text-yellow-400" :
                      "text-gray-400"
                    }>
                      {Math.round(session.context_used_pct)}% context
                    </span>
                  </>
                )}
                {session.cost_duration_ms != null && (
                  <>
                    <span className="text-gray-700">|</span>
                    <span>{formatDuration(session.cost_duration_ms)}</span>
                  </>
                )}
              </div>
            )}
          </div>
          {isActive && (
            <button
              onClick={handleMarkCompleted}
              className="p-1.5 text-gray-600 hover:text-emerald-400 transition-colors rounded-lg hover:bg-gray-800 shrink-0"
              title="Mark as completed"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z" clipRule="evenodd" />
              </svg>
            </button>
          )}
          {!isActive && !session.reviewed_at && (
            <button
              onClick={handleMarkReviewed}
              className="p-1.5 text-yellow-600 hover:text-yellow-400 transition-colors rounded-lg hover:bg-gray-800 shrink-0"
              title="Mark as reviewed"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .044 1.06l-10.5 11.5a.75.75 0 0 1-1.060.039L4.5 12.75a.75.75 0 1 1 1.06-1.06l2.44 2.44 9.963-10.875a.75.75 0 0 1 1.06-.044Z" clipRule="evenodd" />
              </svg>
            </button>
          )}
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="p-1.5 text-gray-600 hover:text-red-400 transition-colors rounded-lg hover:bg-gray-800 shrink-0"
            title="Delete session"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.52.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193V3.75A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.34.06a.75.75 0 1 0-1.5-.06l-.3 7.5a.75.75 0 1 0 1.5.06l.3-7.5Z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
        {session.last_activity && (
          <div className="mt-2 text-xs text-gray-500">
            Last: <span className="text-gray-400">{session.last_activity}</span>
          </div>
        )}
      </div>

      {/* Session Notes — collapsible memo area */}
      <div className="border-b border-gray-800">
        <button
          onClick={() => setNotesCollapsed(!notesCollapsed)}
          className="w-full px-4 py-2 flex items-center gap-2 text-left hover:bg-white/[0.02] transition-colors"
        >
          <span className="text-gray-500 text-xs">&#9997;</span>
          <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Notes
          </span>
          {notesText && notesCollapsed && (
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
          )}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className={`w-3.5 h-3.5 ml-auto text-gray-500 transition-transform ${notesCollapsed ? "" : "rotate-180"}`}
          >
            <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
          </svg>
        </button>
        {!notesCollapsed && (
          <div className="px-4 pb-3">
            <textarea
              value={notesText}
              onChange={(e) => {
                const val = e.target.value;
                setNotesText(val);
                if (notesSessionIdRef.current) {
                  saveNotes(notesSessionIdRef.current, val);
                }
              }}
              maxLength={10000}
              placeholder="Add notes for this session..."
              className="w-full h-24 bg-gray-900/60 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 resize-y focus:outline-none focus:border-gray-500 transition-colors"
            />
          </div>
        )}
      </div>

      {/* Waiting Context — what Claude is asking / previously asked */}
      {session.waiting_context && (
        <div className={`border-b ${session.status === "waiting_input" ? "border-yellow-900/30 bg-yellow-950/20" : "border-gray-800 bg-gray-900/40"}`}>
          <button
            onClick={() => setContextCollapsed(!contextCollapsed)}
            className="w-full p-4 flex items-center gap-2 text-left hover:bg-white/[0.02] transition-colors"
          >
            {session.status === "waiting_input" ? (
              <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse shrink-0" />
            ) : (
              <span className="w-2 h-2 rounded-full bg-gray-600 shrink-0" />
            )}
            <span className={`text-xs font-semibold uppercase tracking-wide ${session.status === "waiting_input" ? "text-yellow-400" : "text-gray-500"}`}>
              {session.status === "waiting_input"
                ? "Waiting for your input"
                : `Previous context${session.waiting_context?.includes("プランの承認待ち") ? " (Plan)" : ""}`}
            </span>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className={`w-3.5 h-3.5 ml-auto text-gray-500 transition-transform ${contextCollapsed ? "" : "rotate-180"}`}
            >
              <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
            </svg>
          </button>
          {!contextCollapsed && (
            <div className="px-4 pb-4 text-sm text-gray-200 leading-relaxed max-h-[60vh] overflow-y-auto prose-sm">
              <Markdown remarkPlugins={[remarkGfm]} components={waitingContextComponents}>{session.waiting_context}</Markdown>
            </div>
          )}
        </div>
      )}

      {/* Pending Approvals */}
      {pendingApprovals.length > 0 && (
        <div className="p-4 border-b border-gray-800">
          {pendingApprovals.map((a) => (
            <ApprovalBanner key={a.id} approval={a} />
          ))}
        </div>
      )}

      {/* Event Timeline */}
      <div className="flex-1 overflow-y-auto p-4">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
          Activity ({events.length})
        </h3>
        <EventTimeline events={events} />

        {/* CLI Output */}
        {cliOutputs.length > 0 && (
          <div className="mt-4">
            <h3 className="text-xs font-semibold text-purple-400 uppercase tracking-wide mb-2">
              Live Output
            </h3>
            <div className="bg-gray-900/80 border border-purple-900/30 rounded-lg p-3 space-y-1">
              {cliOutputs.map((output, idx) => (
                <div key={idx}>
                  {output.output && (
                    <pre className="text-[11px] text-gray-300 whitespace-pre-wrap font-mono">
                      {output.output}
                    </pre>
                  )}
                  {output.is_complete && (
                    <div className="text-[10px] text-purple-500 mt-1">
                      ─── Command completed ───
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer: Prompt input area */}
      <div className="p-4 border-t border-gray-800 space-y-3">
        {/* Prompt input form */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
              Send Prompt
            </span>
            {isSendingPrompt && (
              <span className="text-xs text-purple-400 animate-pulse">Sending...</span>
            )}
          </div>
          <div className="flex gap-2">
            <textarea
              value={promptInput}
              onChange={(e) => setPromptInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  handleSendPrompt();
                }
              }}
              placeholder="Type your instruction here... (Cmd/Ctrl+Enter to send)"
              className="flex-1 bg-gray-900/60 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 resize-none focus:outline-none focus:border-purple-500 transition-colors h-20"
              disabled={isSendingPrompt}
            />
            <button
              onClick={handleSendPrompt}
              disabled={!promptInput.trim() || isSendingPrompt}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg transition-colors font-medium text-sm h-20 shrink-0"
            >
              Send
            </button>
          </div>
        </div>

        {/* Session info (original footer content) */}
        {isActive && (
          <div className="pt-3 border-t border-gray-800/50">
            <div className="text-xs text-gray-500 mb-2">
              Quick actions:
            </div>
            <div className="flex gap-2">
              <CopyButton
                text={`claude --resume ${session.id}`}
                label="Copy resume command"
              />
              <CopyButton
                text={session.id}
                label="Copy session ID"
              />
            </div>
          </div>
        )}
      </div>

      {showDeleteConfirm && (
        <ConfirmDialog
          title="このセッションを削除しますか？"
          message="このセッションはもう使用していませんか？ 削除するとタイムラインや履歴も完全に消去されます。"
          confirmLabel="削除する"
          cancelLabel="キャンセル"
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}
    </div>
  );
}
