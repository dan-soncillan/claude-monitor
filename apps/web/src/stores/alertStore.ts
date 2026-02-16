import { create } from "zustand";
import type { MemoryAlert } from "@claude-monitor/shared";

interface TimedAlert extends MemoryAlert {
  id: string;
  timestamp: number;
}

interface AlertState {
  alerts: TimedAlert[];
  addAlert: (alert: MemoryAlert) => void;
  dismissAlert: (id: string) => void;
}

export const useAlertStore = create<AlertState>((set) => ({
  alerts: [],
  addAlert: (alert) =>
    set((state) => ({
      alerts: [
        { ...alert, id: crypto.randomUUID(), timestamp: Date.now() },
        ...state.alerts,
      ].slice(0, 10),
    })),
  dismissAlert: (id) =>
    set((state) => ({
      alerts: state.alerts.filter((a) => a.id !== id),
    })),
}));
