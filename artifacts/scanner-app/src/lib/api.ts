const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export const API = `${BASE}/api`;

async function req<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(opts?.headers ?? {}) },
    ...opts,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

// ── Auth ──────────────────────────────────────────────────────────────────────
export interface SupervisorInfo {
  id: number;
  fullName: string;
  login: string;
  role: "supervisor" | "admin";
  department: string | null;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
}

export interface LoginResult { token: string; supervisor: SupervisorInfo }

export const authApi = {
  setupRequired: () => req<{ required: boolean }>("/auth/setup-required"),
  setup: (body: { fullName: string; login: string; password: string; confirmPassword: string; department?: string }) =>
    req<{ ok: boolean }>("/auth/setup", { method: "POST", body: JSON.stringify(body) }),
  login: (body: { login: string; password: string; rememberMe?: boolean }) =>
    req<LoginResult>("/auth/login", { method: "POST", body: JSON.stringify(body) }),
  me: () => req<SupervisorInfo>("/auth/me"),
  logout: () => req<{ ok: boolean }>("/auth/logout", { method: "POST" }),
  changePassword: (body: { currentPassword: string; newPassword: string; confirmNewPassword: string }) =>
    req<{ ok: boolean; message: string }>("/auth/change-password", { method: "POST", body: JSON.stringify(body) }),
  accounts: () => req<SupervisorInfo[]>("/auth/accounts"),
  createAccount: (body: { fullName: string; login: string; password: string; role?: string; department?: string }) =>
    req<SupervisorInfo>("/auth/accounts", { method: "POST", body: JSON.stringify(body) }),
  resetPassword: (id: number, temporaryPassword: string) =>
    req<{ ok: boolean }>(`/auth/accounts/${id}/reset-password`, { method: "POST", body: JSON.stringify({ temporaryPassword }) }),
  setStatus: (id: number, active: boolean) =>
    req<{ ok: boolean }>(`/auth/accounts/${id}/status`, { method: "PATCH", body: JSON.stringify({ active }) }),
};

// ── Supervisor ────────────────────────────────────────────────────────────────
export interface WorkstationState {
  workplaceId: number;
  workplaceName: string;
  operatorId: number | null;
  operatorName: string | null;
  operatorTabNumber: string | null;
  shiftId: number | null;
  shiftName: string | null;
  status: string;
  currentBarcode: string | null;
  currentSku: string | null;
  currentProductName: string | null;
  currentQuantity: number;
  operationStartTime: string | null;
  operationDurationSeconds: number;
  pauseDurationSeconds: number;
  lastScanTime: string | null;
  shiftUnitsTotal: number;
  shiftOperationsTotal: number;
  avgSecondsPerUnit: number;
  loginTime: string | null;
  lastHeartbeat: string;
  /** People at the workstation (from "Количество людей" tab) */
  peopleCount?: number;
  peopleNames?: string[];
}

export interface SecurityLogEntry {
  id: number;
  timestamp: string;
  userId: string | null;
  userLogin: string | null;
  userRole: string | null;
  computer: string | null;
  ipAddress: string | null;
  action: string;
  result: string;
  description: string | null;
}

export const supervisorApi = {
  workstations: () => req<WorkstationState[]>("/supervisor/workstations"),
  forceStop: (id: number, comment?: string) =>
    req<any>(`/supervisor/operations/${id}/force-stop`, { method: "POST", body: JSON.stringify({ comment }) }),
  addComment: (id: number, body: { comment?: string; flag?: boolean; flagReason?: string }) =>
    req<{ ok: boolean }>(`/supervisor/operations/${id}/comment`, { method: "PATCH", body: JSON.stringify(body) }),
  securityLog: (params?: { limit?: number; offset?: number }) => {
    const qs = new URLSearchParams(params as any).toString();
    return req<SecurityLogEntry[]>(`/supervisor/security-log${qs ? `?${qs}` : ""}`);
  },
  flaggedOperations: (params?: Record<string, string>) => {
    const qs = new URLSearchParams(params).toString();
    return req<any[]>(`/supervisor/flagged-operations${qs ? `?${qs}` : ""}`);
  },
  history: (params: Record<string, string>) => {
    const qs = new URLSearchParams(params).toString();
    return req<{ items: any[]; total: number }>(`/supervisor/history?${qs}`);
  },
  exportExcel: (params: Record<string, string>) => {
    const qs = new URLSearchParams(params).toString();
    return `${API}/supervisor/export/excel?${qs}`;
  },
};
