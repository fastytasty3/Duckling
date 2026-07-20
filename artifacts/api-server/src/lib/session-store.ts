// Simple in-memory session store for current operator/shift/workplace
// In a real desktop Electron app this would persist to SQLite settings

interface SessionData {
  operatorId: number | null;
  shiftId: number | null;
  workplaceId: number | null;
  operatorName: string | null;
  shiftName: string | null;
  workplaceName: string | null;
  zone: string | null;
  shift: "day" | "night" | null;
}

let session: SessionData = {
  operatorId: null,
  shiftId: null,
  workplaceId: null,
  operatorName: null,
  shiftName: null,
  workplaceName: null,
  zone: null,
  shift: null,
};

export function getSession(): SessionData {
  return { ...session };
}

export function setSession(data: SessionData): void {
  session = { ...data };
}

export function clearSession(): void {
  session = {
    operatorId: null,
    shiftId: null,
    workplaceId: null,
    operatorName: null,
    shiftName: null,
    workplaceName: null,
    zone: null,
    shift: null,
  };
}
