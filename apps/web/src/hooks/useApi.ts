const BASE = "/api";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

export const api = {
  // Sessions
  getSessions: (status?: string) =>
    request<any[]>(`/sessions${status ? `?status=${status}` : ""}`),

  getDirectories: () => request<string[]>("/sessions/directories"),

  getSession: (id: string) => request<any>(`/sessions/${id}`),

  deleteSession: (id: string) =>
    request<{ deleted: number }>(`/sessions/${id}`, { method: "DELETE" }),

  completeSession: (id: string) =>
    request<any>(`/sessions/${id}/complete`, { method: "POST" }),

  markRead: (id: string) =>
    request<any>(`/sessions/${id}/read`, { method: "POST" }),

  updateNotes: (id: string, notes: string) =>
    request<{ ok: boolean }>(`/sessions/${id}/notes`, {
      method: "PUT",
      body: JSON.stringify({ notes }),
    }),

  deleteSessionsByStatus: (status: string, cwd?: string) =>
    request<{ deleted: number }>(
      `/sessions?status=${status}${cwd ? `&cwd=${encodeURIComponent(cwd)}` : ""}`,
      { method: "DELETE" },
    ),

  getSessionEvents: (id: string, limit = 100) =>
    request<any[]>(`/sessions/${id}/events?limit=${limit}`),

  // Approvals
  getApprovals: (status?: string) =>
    request<any[]>(`/approvals${status ? `?status=${status}` : ""}`),

  approveApproval: (id: number, decidedBy: string, reason?: string) =>
    request<any>(`/approvals/${id}`, {
      method: "PUT",
      body: JSON.stringify({
        status: "approved",
        decided_by: decidedBy,
        decision_reason: reason,
      }),
    }),

  rejectApproval: (id: number, decidedBy: string, reason?: string) =>
    request<any>(`/approvals/${id}`, {
      method: "PUT",
      body: JSON.stringify({
        status: "rejected",
        decided_by: decidedBy,
        decision_reason: reason,
      }),
    }),

  // Rules
  getRules: () => request<any[]>("/rules"),

  createRule: (rule: any) =>
    request<any>("/rules", {
      method: "POST",
      body: JSON.stringify(rule),
    }),

  deleteRule: (id: number) =>
    request<any>(`/rules/${id}`, { method: "DELETE" }),

  // Settings
  getServerSettings: () => request<any>("/settings"),
  updateServerSettings: (settings: Record<string, unknown>) =>
    request<any>("/settings", {
      method: "PUT",
      body: JSON.stringify(settings),
    }),

  // Commands
  sendInstruction: (sessionId: string, instruction: string) =>
    request<{ command_id: string; status: string }>(`/sessions/${sessionId}/send`, {
      method: "POST",
      body: JSON.stringify({ instruction }),
    }),
};
