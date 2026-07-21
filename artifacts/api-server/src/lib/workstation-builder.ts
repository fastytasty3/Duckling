import { workplacesTable, operationsTable, attendanceLogsTable } from "@workspace/db";

type Workplace  = typeof workplacesTable.$inferSelect;
type Operation  = typeof operationsTable.$inferSelect;
type Attendance = typeof attendanceLogsTable.$inferSelect;

interface ShiftStats {
  shiftOperationsTotal: number;
  shiftUnitsTotal: number;
  avgSecondsPerUnit: number;
}

// ---------------------------------------------------------------------------
// Shift statistics for one workplace
// ---------------------------------------------------------------------------

export function calcShiftStats(
  todayOps: Operation[],
  activeOp: Operation | undefined,
  workplaceId: number,
): ShiftStats {
  const shiftOps = todayOps.filter(o => o.workplaceId === workplaceId);
  const shiftOperationsTotal = shiftOps.length + (activeOp ? 1 : 0);
  const shiftUnitsTotal = shiftOps.reduce((acc, o) => acc + (o.quantity ?? 0), 0) + (activeOp?.quantity ?? 0);
  const avgDurations = shiftOps
    .filter(o => o.netDurationSeconds && o.quantity)
    .map(o => o.netDurationSeconds! / o.quantity!);
  const avgSecondsPerUnit = avgDurations.length
    ? Math.round(avgDurations.reduce((a, b) => a + b, 0) / avgDurations.length)
    : 0;
  return { shiftOperationsTotal, shiftUnitsTotal, avgSecondsPerUnit };
}

// ---------------------------------------------------------------------------
// Attendance helpers
// ---------------------------------------------------------------------------

function getAttendanceFio(att: Attendance | undefined): { peopleNames: string[]; peopleCount: number } {
  if (!att) return { peopleNames: [], peopleCount: 0 };
  return {
    peopleNames: (att.peopleNames as string[]).filter(Boolean),
    peopleCount: att.peopleCount ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Build workstation entry: WS-connected case
// ---------------------------------------------------------------------------

export function buildFromWs(
  wp: Workplace,
  ws: Record<string, any>,
  op: Operation | undefined,
  att: Attendance | undefined,
  stats: ShiftStats,
): Record<string, any> {
  const { peopleNames: attNames, peopleCount: attCount } = getAttendanceFio(att);
  const hasFio = Array.isArray(ws.peopleNames) && (ws.peopleNames as string[]).filter(Boolean).length > 0;
  return {
    ...ws,
    zone: wp.zone,
    activeOperationId: op?.id ?? null,
    ...stats,
    peopleNames: hasFio ? ws.peopleNames : attNames,
    peopleCount: hasFio ? (ws.peopleCount ?? attCount) : attCount,
  };
}

// ---------------------------------------------------------------------------
// Build workstation entry: DB-only (active op, no WS connection)
// ---------------------------------------------------------------------------

export function buildFromOp(
  wp: Workplace,
  op: Operation,
  att: Attendance | undefined,
  stats: ShiftStats,
  now: number,
): Record<string, any> {
  const { peopleNames, peopleCount } = getAttendanceFio(att);
  const elapsedSec = Math.floor((now - new Date(op.startTime).getTime()) / 1000);
  const pauseSec = op.pauseDurationSeconds ?? 0;
  return {
    workplaceId: wp.id,
    workplaceName: op.workplaceName ?? wp.name,
    zone: wp.zone,
    activeOperationId: op.id,
    operatorId: op.operatorId,
    operatorName: op.operatorName,
    operatorTabNumber: op.operatorTabNumber,
    shiftId: op.shiftId,
    shiftName: op.shiftName,
    loginTime: op.startTime.toISOString(),
    status: op.status === "paused" ? "paused" : "working",
    currentBarcode: op.barcode,
    currentSku: op.productSku,
    currentProductName: op.productName,
    currentQuantity: op.quantity,
    operationStartTime: op.startTime.toISOString(),
    operationDurationSeconds: Math.max(0, elapsedSec - pauseSec),
    pauseDurationSeconds: pauseSec,
    lastScanTime: op.startTime.toISOString(),
    lastHeartbeat: new Date().toISOString(),
    peopleNames,
    peopleCount,
    ...stats,
  };
}

// ---------------------------------------------------------------------------
// Build workstation entry: inactive (no WS, no active op)
// ---------------------------------------------------------------------------

export function buildInactive(
  wp: Workplace,
  att: Attendance | undefined,
  stats: ShiftStats,
): Record<string, any> {
  const { peopleNames, peopleCount } = getAttendanceFio(att);
  return {
    workplaceId: wp.id,
    workplaceName: wp.name,
    zone: wp.zone,
    activeOperationId: null,
    operatorId: null,
    operatorName: null,
    operatorTabNumber: null,
    shiftId: null,
    shiftName: null,
    loginTime: null,
    status: "unauthorized",
    currentBarcode: null,
    currentSku: null,
    currentProductName: null,
    currentQuantity: 0,
    operationStartTime: null,
    operationDurationSeconds: 0,
    pauseDurationSeconds: 0,
    lastScanTime: null,
    lastHeartbeat: new Date(0).toISOString(),
    peopleNames,
    peopleCount,
    ...stats,
  };
}
