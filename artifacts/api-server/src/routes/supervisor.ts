import { Router, type IRouter } from "express";
import { and, desc, eq, gte, isNull, lte, or, ne } from "drizzle-orm";
import { db, operationsTable, operationPausesTable, securityLogTable, workplacesTable, attendanceLogsTable } from "@workspace/db";
import { requireAuth } from "../lib/auth";
import { logSecurity } from "../lib/auth";
import { getWorkstations } from "../lib/ws-server";
import { operationToDto, finalizeOperation, getOperationWithPauses } from "../lib/operation-helper";

const router: IRouter = Router();

// All routes require supervisor or admin role
const auth = requireAuth(["supervisor", "admin"]);

// Real-time workstation status — DB-driven, WS data supplements
router.get("/supervisor/workstations", auth, async (req, res): Promise<void> => {
  const sv = (req as any).supervisor;
  // Zone filter: supervisors only see their zone; admins see all
  const zoneFilter: string | null = (sv.role === "supervisor" && sv.department) ? sv.department : null;

  // WS map (populated when operators connect via WebSocket)
  const wsMap = new Map(getWorkstations().map(w => [w.workplaceId, w]));

  // Active workplaces (optionally filtered by zone)
  const workplaces = await db.select().from(workplacesTable).where(eq(workplacesTable.active, true));

  // Active / paused operations per workplace (most recent per workplace)
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const activeOps = await db.select().from(operationsTable)
    .where(and(
      isNull(operationsTable.deletedAt),
      or(eq(operationsTable.status, "active"), eq(operationsTable.status, "paused")),
      gte(operationsTable.startTime, startOfDay),
    ))
    .orderBy(desc(operationsTable.startTime));

  // Today's completed ops per workplace for shift totals
  const todayOps = await db.select().from(operationsTable)
    .where(and(
      isNull(operationsTable.deletedAt),
      ne(operationsTable.status, "active"),
      ne(operationsTable.status, "paused"),
      gte(operationsTable.startTime, startOfDay),
    ));

  // Keep only the first (most recent) active op per workplace
  const opByWorkplace = new Map<number, typeof operationsTable.$inferSelect>();
  for (const op of activeOps) {
    if (op.workplaceId && !opByWorkplace.has(op.workplaceId)) {
      opByWorkplace.set(op.workplaceId, op);
    }
  }

  // Today's attendance logs — most recent per workplace (for FIO display)
  const today = new Date().toISOString().slice(0, 10);
  let attendanceRows: (typeof attendanceLogsTable.$inferSelect)[] = [];
  try {
    attendanceRows = await db.select().from(attendanceLogsTable)
      .where(eq(attendanceLogsTable.logDate, today))
      .orderBy(desc(attendanceLogsTable.updatedAt));
  } catch (_) { /* table may not exist on first deploy */ }

  // Keep only the most recent attendance per workplace
  const attendanceByWorkplace = new Map<number, typeof attendanceLogsTable.$inferSelect>();
  for (const a of attendanceRows) {
    if (a.workplaceId && !attendanceByWorkplace.has(a.workplaceId)) {
      attendanceByWorkplace.set(a.workplaceId, a);
    }
  }

  // Build workstation states
  const now = Date.now();
  const result = [];

  for (const wp of workplaces) {
    // Zone isolation: skip workplaces that don't belong to this supervisor's zone
    if (zoneFilter && wp.zone !== zoneFilter) continue;

    const ws = wsMap.get(wp.id);
    const op = opByWorkplace.get(wp.id);

    // Shift stats for this workplace
    const shiftOps = todayOps.filter(o => o.workplaceId === wp.id);
    const shiftOpsTotal = shiftOps.length + (op ? 1 : 0);
    const shiftUnitsTotal = shiftOps.reduce((acc, o) => acc + (o.quantity ?? 0), 0) + (op?.quantity ?? 0);
    const avgDurations = shiftOps.filter(o => o.netDurationSeconds && o.quantity).map(o => o.netDurationSeconds! / o.quantity!);
    const avgSecondsPerUnit = avgDurations.length ? Math.round(avgDurations.reduce((a, b) => a + b, 0) / avgDurations.length) : 0;

    // Attendance fallback: use DB data when WS doesn't have FIO
    const att = attendanceByWorkplace.get(wp.id);
    const attPeopleNames = att ? (att.peopleNames as string[]).filter(Boolean) : [];
    const attPeopleCount = att?.peopleCount ?? 0;

    if (ws) {
      // WS data is most up-to-date; if it lacks FIO, fill from attendance_logs
      const hasFio = Array.isArray(ws.peopleNames) && (ws.peopleNames as string[]).filter(Boolean).length > 0;
      result.push({
        ...ws,
        zone: wp.zone,
        activeOperationId: op?.id ?? null,
        shiftOperationsTotal: shiftOpsTotal,
        shiftUnitsTotal,
        avgSecondsPerUnit,
        peopleNames: hasFio ? ws.peopleNames : attPeopleNames,
        peopleCount: hasFio ? (ws.peopleCount ?? attPeopleCount) : attPeopleCount,
      });
      continue;
    }

    if (op) {
      // DB-derived state (no WS connection but active operation)
      const elapsedSec = Math.floor((now - new Date(op.startTime).getTime()) / 1000);
      const pauseSec = op.pauseDurationSeconds ?? 0;
      const netSec = Math.max(0, elapsedSec - pauseSec);

      result.push({
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
        operationDurationSeconds: netSec,
        pauseDurationSeconds: pauseSec,
        lastScanTime: op.startTime.toISOString(),
        shiftUnitsTotal,
        shiftOperationsTotal: shiftOpsTotal,
        avgSecondsPerUnit,
        lastHeartbeat: new Date().toISOString(),
        peopleNames: attPeopleNames,
        peopleCount: attPeopleCount,
      });
      continue;
    }

    // Inactive workplace — no WS, no active operation; still show in list
    result.push({
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
      shiftUnitsTotal,
      shiftOperationsTotal: shiftOpsTotal,
      avgSecondsPerUnit,
      lastHeartbeat: new Date(0).toISOString(),
      peopleNames: [],
      peopleCount: 0,
    });
  }

  res.json(result);
});

// Force-stop a stuck operation (supervisor action)
router.post("/supervisor/operations/:id/force-stop", auth, async (req, res): Promise<void> => {
  const sv = (req as any).supervisor;
  const id = parseInt(req.params.id, 10);
  const { comment } = req.body ?? {};

  await finalizeOperation(id);
  await db.update(operationsTable).set({
    completedBySupervisor: true,
    supervisorComment: comment ?? "Завершено контролирующим лицом",
    isFlagged: true,
    flagReason: "Завершено контролирующим лицом",
  }).where(eq(operationsTable.id, id));

  await logSecurity(String(sv.supervisorId), sv.login, sv.role, "force_stop_operation", "success", `Принудительно завершена операция #${id}`, req);

  const data = await getOperationWithPauses(id);
  if (!data) { res.status(404).json({ error: "Не найдено" }); return; }
  res.json(operationToDto(data.op, data.pauses));
});

// Add supervisor comment to operation
router.patch("/supervisor/operations/:id/comment", auth, async (req, res): Promise<void> => {
  const sv = (req as any).supervisor;
  const id = parseInt(req.params.id, 10);
  const { comment, flag, flagReason } = req.body ?? {};

  const updates: Record<string, unknown> = {};
  if (comment !== undefined) updates.supervisorComment = comment;
  if (flag !== undefined) updates.isFlagged = !!flag;
  if (flagReason !== undefined) updates.flagReason = flagReason;

  const [updated] = await db.update(operationsTable).set(updates).where(eq(operationsTable.id, id)).returning({ id: operationsTable.id });
  if (!updated) { res.status(404).json({ error: "Не найдено" }); return; }

  await logSecurity(String(sv.supervisorId), sv.login, sv.role, "edit_operation", "success", `Добавлен комментарий к операции #${id}`, req);
  res.json({ ok: true });
});

// Security log (supervisor can read, not delete)
router.get("/supervisor/security-log", auth, async (req, res): Promise<void> => {
  const limit = parseInt(String(req.query.limit ?? "100"), 10);
  const offset = parseInt(String(req.query.offset ?? "0"), 10);
  const rows = await db.select().from(securityLogTable)
    .orderBy(desc(securityLogTable.timestamp))
    .limit(Math.min(limit, 500))
    .offset(offset);
  res.json(rows.map(r => ({ ...r, timestamp: r.timestamp.toISOString() })));
});

// Flagged / problematic operations
router.get("/supervisor/flagged-operations", auth, async (req, res): Promise<void> => {
  const limit = parseInt(String(req.query.limit ?? "50"), 10);
  const dateFrom = req.query.dateFrom ? new Date(String(req.query.dateFrom)) : undefined;
  const dateTo = req.query.dateTo ? new Date(String(req.query.dateTo)) : undefined;

  const conditions: any[] = [isNull(operationsTable.deletedAt)];
  conditions.push(or(
    eq(operationsTable.isFlagged, true),
    eq(operationsTable.completedBySupervisor, true),
    eq(operationsTable.timeManuallyEdited, true),
    eq(operationsTable.status, "active") // stuck operations
  ));
  if (dateFrom) conditions.push(gte(operationsTable.startTime, dateFrom));
  if (dateTo) conditions.push(lte(operationsTable.startTime, dateTo));

  const rows = await db.select().from(operationsTable)
    .where(and(...conditions))
    .orderBy(desc(operationsTable.startTime))
    .limit(limit);

  const ids = rows.map(r => r.id);
  let pauses: (typeof operationPausesTable.$inferSelect)[] = [];
  if (ids.length > 0) {
    const { inArray } = await import("drizzle-orm");
    pauses = await db.select().from(operationPausesTable).where(inArray(operationPausesTable.operationId, ids));
  }

  res.json(rows.map(op => operationToDto(op, pauses.filter(p => p.operationId === op.id))));
});

// History view for supervisor (all operations, richer filters)
router.get("/supervisor/history", auth, async (req, res): Promise<void> => {
  const limit = Math.min(parseInt(String(req.query.limit ?? "100"), 10), 500);
  const offset = parseInt(String(req.query.offset ?? "0"), 10);
  const conditions: any[] = [isNull(operationsTable.deletedAt)];
  if (req.query.dateFrom) conditions.push(gte(operationsTable.startTime, new Date(String(req.query.dateFrom))));
  if (req.query.dateTo) conditions.push(lte(operationsTable.startTime, new Date(String(req.query.dateTo))));
  if (req.query.operatorId) conditions.push(eq(operationsTable.operatorId, parseInt(String(req.query.operatorId), 10)));
  if (req.query.shiftId) conditions.push(eq(operationsTable.shiftId, parseInt(String(req.query.shiftId), 10)));
  if (req.query.workplaceId) conditions.push(eq(operationsTable.workplaceId, parseInt(String(req.query.workplaceId), 10)));
  if (req.query.status) conditions.push(eq(operationsTable.status, String(req.query.status)));
  if (req.query.barcode) conditions.push(eq(operationsTable.barcode, String(req.query.barcode)));

  const rows = await db.select().from(operationsTable)
    .where(and(...conditions))
    .orderBy(desc(operationsTable.startTime))
    .limit(limit).offset(offset);

  const total = await db.select({ id: operationsTable.id }).from(operationsTable).where(and(...conditions));

  const { inArray } = await import("drizzle-orm");
  const ids = rows.map(r => r.id);
  let pauses: (typeof operationPausesTable.$inferSelect)[] = [];
  if (ids.length > 0) {
    pauses = await db.select().from(operationPausesTable).where(inArray(operationPausesTable.operationId, ids));
  }
  res.json({ items: rows.map(op => operationToDto(op, pauses.filter(p => p.operationId === op.id))), total: total.length });
});

export default router;
