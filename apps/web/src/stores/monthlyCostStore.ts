import { create } from "zustand";
import type { MonthlyCost } from "@claude-monitor/shared";

interface MonthlyCostState {
  currentMonthCost: MonthlyCost | null;
  setCurrentMonthCost: (cost: MonthlyCost) => void;
}

export const useMonthlyCostStore = create<MonthlyCostState>((set) => ({
  currentMonthCost: null,
  setCurrentMonthCost: (cost) => set({ currentMonthCost: cost }),
}));
