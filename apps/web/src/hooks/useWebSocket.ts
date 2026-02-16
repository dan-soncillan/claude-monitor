import { useEffect, useRef, useCallback } from "react";
import type { WSMessage, Event, Session, MonthlyCost, MemoryAlert, CLIOutput } from "@claude-monitor/shared";
import { useSessionStore } from "../stores/sessionStore";
import { useEventStore } from "../stores/eventStore";
import { useApprovalStore } from "../stores/approvalStore";
import { useSettingsStore } from "../stores/settingsStore";
import { useAlertStore } from "../stores/alertStore";
import { useMonthlyCostStore } from "../stores/monthlyCostStore";
import { useCLIOutputStore } from "../stores/cliOutputStore";
import { api } from "./useApi";

const SESSION_POLL_INTERVAL = 60_000; // 60 seconds
const ACTIVE_POLL_INTERVAL = 3_000; // 3 seconds for sessions in waiting states
const RECONNECT_BASE_MS = 3_000;
const RECONNECT_MAX_MS = 60_000;

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const pollRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const activePollRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const unmountedRef = useRef(false);
  const reconnectAttemptsRef = useRef(0);
  const updateSession = useSessionStore((s) => s.updateSession);
  const removeSession = useSessionStore((s) => s.removeSession);
  const setSessions = useSessionStore((s) => s.setSessions);
  const addEvent = useEventStore((s) => s.addEvent);
  const addApproval = useApprovalStore((s) => s.addApproval);
  const updateApproval = useApprovalStore((s) => s.updateApproval);
  const addCLIOutput = useCLIOutputStore((s) => s.addOutput);

  const connect = useCallback(() => {
    // Close existing connection before creating a new one
    if (wsRef.current) {
      try { wsRef.current.close(); } catch { /* ignore */ }
      wsRef.current = null;
    }

    if (unmountedRef.current) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("[WS] Connected");
      reconnectAttemptsRef.current = 0;
    };

    ws.onmessage = (event) => {
      try {
        const msg: WSMessage = JSON.parse(event.data);
        switch (msg.type) {
          case "sessions_sync": {
            // Batch initial sync from server
            const sessions = msg.data as Session[];
            setSessions(sessions);
            break;
          }
          case "session_updated": {
            const session = msg.data as Session;
            // Auto-mark as read if this session is currently being viewed
            // but only if it's actually unread (read_at < updated_at) to prevent loop
            const selectedId = useSessionStore.getState().selectedSessionId;
            if (selectedId === session.id && (!session.read_at || session.read_at < session.updated_at)) {
              api.markRead(session.id).catch(console.error);
            }
            updateSession(session);
            break;
          }
          case "session_deleted":
            removeSession((msg.data as { id: string }).id);
            break;
          case "event_created": {
            // Only add events for the currently selected session
            const ev = msg.data as Event;
            const selectedId = useSessionStore.getState().selectedSessionId;
            if (selectedId && ev.session_id === selectedId) {
              addEvent(ev);
            }
            break;
          }
          case "approval_created":
            addApproval(msg.data as any);
            break;
          case "approval_updated":
            updateApproval(msg.data as any);
            break;
          case "cli_output": {
            const cliOutput = msg.data as CLIOutput;
            addCLIOutput(cliOutput.session_id, cliOutput);
            break;
          }
          case "memory_alert":
            useAlertStore.getState().addAlert(msg.data as MemoryAlert);
            break;
          case "monthly_cost_updated":
            useMonthlyCostStore.getState().setCurrentMonthCost(msg.data as MonthlyCost);
            break;
          case "connected":
            console.log("[WS]", (msg.data as any).message);
            break;
        }
      } catch (e) {
        console.error("[WS] Parse error:", e);
      }
    };

    ws.onclose = () => {
      // Don't reconnect if component unmounted
      if (unmountedRef.current) return;
      // Exponential backoff: 3s, 6s, 12s, 24s, ... up to 60s
      const delay = Math.min(
        RECONNECT_BASE_MS * Math.pow(2, reconnectAttemptsRef.current),
        RECONNECT_MAX_MS
      );
      reconnectAttemptsRef.current++;
      console.log(`[WS] Disconnected, reconnecting in ${delay / 1000}s (attempt ${reconnectAttemptsRef.current})...`);
      reconnectTimeoutRef.current = setTimeout(connect, delay);
    };

    ws.onerror = (err) => {
      console.error("[WS] Error:", err);
      ws.close();
    };
  }, [updateSession, removeSession, addEvent, addApproval, updateApproval]);

  // Fast poll for sessions in waiting states
  useEffect(() => {
    const checkWaiting = () => {
      const sessions = useSessionStore.getState().sessions;
      const hasWaiting = sessions.some((s) => s.status === "waiting_input");

      if (hasWaiting && !activePollRef.current) {
        activePollRef.current = setInterval(() => {
          api.getSessions().then(setSessions).catch(console.error);
        }, ACTIVE_POLL_INTERVAL);
      } else if (!hasWaiting && activePollRef.current) {
        clearInterval(activePollRef.current);
        activePollRef.current = undefined;
      }
    };

    // Subscribe to session changes to toggle fast polling
    const unsub = useSessionStore.subscribe(checkWaiting);
    checkWaiting();

    return () => {
      unsub();
      clearInterval(activePollRef.current);
      activePollRef.current = undefined;
    };
  }, [setSessions]);

  // Load server settings and current month cost on mount
  useEffect(() => {
    useSettingsStore.getState().loadServerSettings();
    api.getCurrentMonthlyCost()
      .then((cost) => useMonthlyCostStore.getState().setCurrentMonthCost(cost))
      .catch(console.error);
  }, []);

  useEffect(() => {
    unmountedRef.current = false;
    connect();

    // Periodic poll to sync session statuses (catches missed WebSocket updates)
    pollRef.current = setInterval(() => {
      api.getSessions().then(setSessions).catch(console.error);
    }, SESSION_POLL_INTERVAL);

    return () => {
      unmountedRef.current = true;
      clearTimeout(reconnectTimeoutRef.current);
      clearInterval(pollRef.current);
      clearInterval(activePollRef.current);
      activePollRef.current = undefined;
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [connect, setSessions]);
}
