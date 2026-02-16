import { create } from "zustand";
import type { Event } from "@claude-monitor/shared";

interface EventState {
  events: Event[];
  setEvents: (events: Event[]) => void;
  addEvent: (event: Event) => void;
  clearEvents: () => void;
}

export const useEventStore = create<EventState>((set) => ({
  events: [],
  setEvents: (events) => set({ events }),
  addEvent: (event) =>
    set((state) => {
      // Deduplicate by event id
      if (state.events.some((e) => e.id === event.id)) return state;
      return { events: [event, ...state.events] };
    }),
  clearEvents: () => set({ events: [] }),
}));
