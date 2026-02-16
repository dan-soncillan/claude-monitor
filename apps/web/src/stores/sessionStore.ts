import { create } from "zustand";
import type { Session } from "@claude-monitor/shared";

// Statuses that require user attention and trigger unseen highlighting
const ATTENTION_STATUSES = new Set(["completed", "waiting_input", "error"]);

interface SessionState {
  sessions: Session[];
  selectedSessionId: string | null;
  setSessions: (sessions: Session[]) => void;
  updateSession: (session: Session) => void;
  removeSession: (id: string) => void;
  selectSession: (id: string | null) => void;
  isUnseen: (id: string) => boolean;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  sessions: [],
  selectedSessionId: null,
  setSessions: (sessions) =>
    set((state) => {
      const apiIds = new Set(sessions.map((s) => s.id));
      return {
        sessions: [...sessions].sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
        selectedSessionId: state.selectedSessionId && !apiIds.has(state.selectedSessionId)
          ? null : state.selectedSessionId,
      };
    }),
  updateSession: (session) =>
    set((state) => {
      const idx = state.sessions.findIndex((s) => s.id === session.id);
      if (idx >= 0) {
        const updated = [...state.sessions];
        updated[idx] = session;
        return { sessions: updated };
      }
      return { sessions: [session, ...state.sessions] };
    }),
  removeSession: (id) =>
    set((state) => ({
      sessions: state.sessions.filter((s) => s.id !== id),
      selectedSessionId: state.selectedSessionId === id ? null : state.selectedSessionId,
    })),
  selectSession: (id) => set({ selectedSessionId: id }),
  isUnseen: (id) => {
    const session = get().sessions.find((s) => s.id === id);
    if (!session) return false;
    if (!ATTENTION_STATUSES.has(session.status)) return false;
    // Unseen if never read, or if updated after last read
    if (!session.read_at) return true;
    return session.updated_at > session.read_at;
  },
}));
