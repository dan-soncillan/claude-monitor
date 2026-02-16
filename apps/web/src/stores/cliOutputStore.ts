import { create } from "zustand";
import type { CLIOutput } from "@claude-monitor/shared";

interface CLIOutputState {
  outputs: Record<string, CLIOutput[]>; // session_id -> CLIOutput[]
  addOutput: (sessionId: string, output: CLIOutput) => void;
  clearOutputs: (sessionId: string) => void;
  getOutputs: (sessionId: string) => CLIOutput[];
}

export const useCLIOutputStore = create<CLIOutputState>((set, get) => ({
  outputs: {},
  addOutput: (sessionId, output) =>
    set((state) => ({
      outputs: {
        ...state.outputs,
        [sessionId]: [...(state.outputs[sessionId] || []), output],
      },
    })),
  clearOutputs: (sessionId) =>
    set((state) => {
      const { [sessionId]: _, ...rest } = state.outputs;
      return { outputs: rest };
    }),
  getOutputs: (sessionId) => get().outputs[sessionId] || [],
}));
