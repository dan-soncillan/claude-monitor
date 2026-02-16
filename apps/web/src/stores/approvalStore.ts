import { create } from "zustand";
import type { Approval } from "@claude-monitor/shared";

const MAX_APPROVALS = 100;

interface ApprovalState {
  approvals: Approval[];
  setApprovals: (approvals: Approval[]) => void;
  addApproval: (approval: Approval) => void;
  updateApproval: (approval: Approval) => void;
}

export const useApprovalStore = create<ApprovalState>((set) => ({
  approvals: [],
  setApprovals: (approvals) => set({ approvals: approvals.slice(0, MAX_APPROVALS) }),
  addApproval: (approval) =>
    set((state) => ({ approvals: [approval, ...state.approvals].slice(0, MAX_APPROVALS) })),
  updateApproval: (approval) =>
    set((state) => ({
      approvals: state.approvals.map((a) =>
        a.id === approval.id ? approval : a
      ),
    })),
}));
