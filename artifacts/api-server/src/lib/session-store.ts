// Per-workplace in-memory session store.
// Each physical workstation is identified by its workplaceId.
// Multiple workplaces can be active simultaneously on the same server.

export interface SessionData {
  operatorId: number | null;
  shiftId: number | null;
  workplaceId: number | null;
  operatorName: string | null;
  shiftName: string | null;
  workplaceName: string | null;
  zone: string | null;
  shift: "day" | "night" | null;
}

const EMPTY: SessionData = {
  operatorId: null,
  shiftId: null,
  workplaceId: null,
  operatorName: null,
  shiftName: null,
  workplaceName: null,
  zone: null,
  shift: null,
};

// Map keyed by workplaceId
const sessions = new Map<number, SessionData>();

export function getSession(workplaceId: number): SessionData {
  return sessions.has(workplaceId) ? { ...sessions.get(workplaceId)! } : { ...EMPTY, workplaceId };
}

export function setSession(workplaceId: number, data: SessionData): void {
  sessions.set(workplaceId, { ...data });
}

export function clearSession(workplaceId: number): void {
  sessions.delete(workplaceId);
}

/** @deprecated Use getSession(workplaceId) instead */
export function getSessionLegacy(): SessionData {
  // Return first active session for legacy callers (should be removed)
  const first = sessions.values().next().value;
  return first ? { ...first } : { ...EMPTY };
}
