import type { Session, Event, Approval } from "@claude-monitor/shared";

const BASE_URL = process.env.MONITOR_API_URL || "http://localhost:4000";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

export const monitorApi = {
  getSessions: (status?: string) =>
    request<Session[]>(`/api/sessions${status ? `?status=${status}` : ""}`),

  getSession: (id: string) => request<Session>(`/api/sessions/${id}`),

  getSessionEvents: (id: string, limit = 10) =>
    request<Event[]>(`/api/sessions/${id}/events?limit=${limit}`),

  getApprovals: (status?: string) =>
    request<Approval[]>(`/api/approvals${status ? `?status=${status}` : ""}`),

  approveApproval: (id: number, decidedBy: string, reason?: string) =>
    request<Approval>(`/api/approvals/${id}`, {
      method: "PUT",
      body: JSON.stringify({ status: "approved", decided_by: decidedBy, decision_reason: reason }),
    }),

  rejectApproval: (id: number, decidedBy: string, reason?: string) =>
    request<Approval>(`/api/approvals/${id}`, {
      method: "PUT",
      body: JSON.stringify({ status: "rejected", decided_by: decidedBy, decision_reason: reason }),
    }),

  sendInstruction: (sessionId: string, instruction: string) =>
    request<{ command_id: string }>(`/api/sessions/${sessionId}/send`, {
      method: "POST",
      body: JSON.stringify({ instruction }),
    }),

  startTask: (instruction: string, cwd: string) =>
    request<{ command_id: string }>(`/api/tasks`, {
      method: "POST",
      body: JSON.stringify({ instruction, cwd }),
    }),
};
