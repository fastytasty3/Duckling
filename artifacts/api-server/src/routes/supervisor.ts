import { Router, type IRouter } from "express";
import { and, desc, eq, gte, isNull, lte, or, ne, inArray } from "drizzle-orm";
import { db, operationsTable, operationPausesTable, securityLogTable, workplacesTable, attendanceLogsTable } from "@workspace/db";
import { requireAuth, logSecurity } from "../lib/auth";
import { resolveOperationForSupervisor } from "../lib/scope";
import { getWorkstations } from "../lib/ws-server";
import { operationToDto, finalizeOperation, getOperationWithPauses } from "../lib/operation-helper";
import { calcShiftStats, buildFromWs, buildFromOp, buildInactive } from "../lib/workstation-builder";

const router: IRouter = Router();
const auth = requireAuth(["supervisor", "admin"]);

// ---------------------------------------------------------------------------
// Helpers: fetch today's data for workstation dashboard
// ---------------------------------------------------------------------------

async function fetchActiveOps() {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  return db.select().from(operationsTable).where(and(
    isNull(operationsTable.deletedAt),
    or(eq(operationsTable.status, "active"), eq(operationsTable.status, "paused")),
    gte(operationsTable.startTime, startOfDay),
  )).orderBy(desc(operationsTable.startTime));
}

async function fetchTodayCompletedOps() {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  return db.select().from(operationsTable).where(and(
    isNull(operationsTable.deletedAt),
    ne(operationsTable.status, "active"),
    ne(operationsTable.status, "paused"),
    gte(operationsTable.startTime, startOfDay),
  ));
}

async function fetchTodayAttendance() {
  const today = new Date().toISOString().slice(0, 10);
  try {
    return await db.select().from(attendanceLogsTable)
      .where(eq(attendanceLogsTable.logDate, today))
      .orderBy(desc(attendanceLogsTable.updatedAt));
  } catch (_) { return []; } // table may not exist on first deploy
}

// ---------------------------------------------------------------------------
// Real-time workstation status
// ---------------------------------------------------------------------------

router.get("/supervisor/workstations", auth, async (req, res): Promise<void> => {
  const sv = (req as any).supervisor;
  const zoneFilter: string | null = sv.role === "supervisor" && sv.department ? sv.department : null;

  const wsMap = new Map(getWorkstations().map(w => [w.workplaceId, w]));
  const [workplaces, activeOps, todayOps, attendanceRows] = await Promise.all([
    db.select().from(workplacesTable).where(eq(workplacesTable.active, true)),
    fetchActiveOps(),
    fetchTodayCompletedOps(),
    fetchTodayAttendance(),
  ]);

  // Most recent active op per workplace
  const opByWorkplace = new Map<number, typeof operationsTable.$inferSelect>();
  for (const op of activeOps) {
    if (op.workplaceId && !opByWorkplace.has(op.workplaceId)) opByWorkplace.set(op.workplaceId, op);
  }

  // Most recent attendance per workplace
  const attendanceByWorkplace = new Map<number, typeof attendanceLogsTable.$inferSelect>();
  for (const a of attendanceRows) {
    if (a.workplaceId && !attendanceByWorkplace.has(a.workplaceId)) attendanceByWorkplace.set(a.workplaceId, a);
  }

  const now = Date.now();
  const result = [];

  for (const wp of workplaces) {
    if (zoneFilter && wp.zone !== zoneFilter) continue;
    const ws  = wsMap.get(wp.id);
    const op  = opByWorkplace.get(wp.id);
    const att = attendanceByWorkplace.get(wp.id);
    const stats = calcShiftStats(todayOps, op, wp.id);

    if (ws)  { result.push(buildFromWs(wp, ws, op, att, stats));       continue; }
    if (op)  { result.push(buildFromOp(wp, op, att, stats, now));      continue; }
    result.push(buildInactive(wp, att, stats));
  }

  res.json(result);
});

// ---------------------------------------------------------------------------
// Force-stop a stuck operation
// ---------------------------------------------------------------------------

router.post("/supervisor/operations/:id/force-stop", auth, async (req, res): Promise<void> => {
  const sv = (req as any).supervisor;
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Некорректный id" }); return; }

  const allowed = await resolveOperationForSupervisor(id, sv);
  if (!allowed) { res.status(403).json({ error: "Доступ запрещён: операция не в вашей зоне" }); return; }

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

// ---------------------------------------------------------------------------
// Add supervisor comment to operation
// ---------------------------------------------------------------------------

router.patch("/supervisor/operations/:id/comment", auth, async (req, res): Promise<void> => {
  const sv = (req as any).supervisor;
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Некорректный id" }); return; }

  const allowed = await resolveOperationForSupervisor(id, sv);
  if (!allowed) { res.status(403).json({ error: "Доступ запрещён: операция не в вашей зоне" }); return; }

  const { comment, flag, flagReason } = req.body ?? {};
  const updates: Record<string, unknown> = {};
  if (comment   !== undefined) updates.supervisorComment = comment;
  if (flag      !== undefined) updates.isFlagged = !!flag;
  if (flagReason !== undefined) updates.flagReason = flagReason;

  const [updated] = await db.update(operationsTable).set(updates)
    .where(eq(operationsTable.id, id)).returning({ id: operationsTable.id });
  if (!updated) { res.status(404).json({ error: "Не найдено" }); return; }

  await logSecurity(String(sv.supervisorId), sv.login, sv.role, "edit_operation", "success", `Добавлен комментарий к операции #${id}`, req);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Security log
// ---------------------------------------------------------------------------

router.get("/supervisor/security-log", auth, async (req, res): Promise<void> => {
  const limit  = Math.min(parseInt(String(req.query.limit  ?? "100"), 10), 500);
  const offset = parseInt(String(req.query.offset ?? "0"), 10);
  const rows = await db.select().from(securityLogTable)
    .orderBy(desc(securityLogTable.timestamp))
    .limit(limit).offset(offset);
  res.json(rows.map(r => ({ ...r, timestamp: r.timestamp.toISOString() })));
});

// ---------------------------------------------------------------------------
// Flagged / problematic operations
// ---------------------------------------------------------------------------

router.get("/supervisor/flagged-operations", auth, async (req, res): Promise<void> => {
  const limit    = parseInt(String(req.query.limit ?? "50"), 10);
  const dateFrom = req.query.dateFrom ? new Date(String(req.query.dateFrom)) : undefined;
  const dateTo   = req.query.dateTo   ? new Date(String(req.query.dateTo))   : undefined;

  const conditions: any[] = [
    isNull(operationsTable.deletedAt),
    or(
      eq(operationsTable.isFlagged, true),
      eq(operationsTable.completedBySupervisor, true),
      eq(operationsTable.timeManuallyEdited, true),
      eq(operationsTable.status, "active"),
    ),
  ];
  if (dateFrom) conditions.push(gte(operationsTable.startTime, dateFrom));
  if (dateTo)   conditions.push(lte(operationsTable.startTime, dateTo));

  const rows = await db.select().from(operationsTable)
    .where(and(...conditions))
    .orderBy(desc(operationsTable.startTime))
    .limit(limit);

  const ids = rows.map(r => r.id);
  const pauses = ids.length > 0
    ? await db.select().from(operationPausesTable).where(inArray(operationPausesTable.operationId, ids))
    : [];

  res.json(rows.map(op => operationToDto(op, pauses.filter(p => p.operationId === op.id))));
});

// ---------------------------------------------------------------------------
// History view
// ---------------------------------------------------------------------------

router.get("/supervisor/history", auth, async (req, res): Promise<void> => {
  const limit  = Math.min(parseInt(String(req.query.limit  ?? "100"), 10), 500);
  const offset = parseInt(String(req.query.offset ?? "0"), 10);

  const conditions: any[] = [isNull(operationsTable.deletedAt)];
  if (req.query.dateFrom)    conditions.push(gte(operationsTable.startTime, new Date(String(req.query.dateFrom))));
  if (req.query.dateTo)      conditions.push(lte(operationsTable.startTime, new Date(String(req.query.dateTo))));
  if (req.query.operatorId)  conditions.push(eq(operationsTable.operatorId,  parseInt(String(req.query.operatorId),  10)));
  if (req.query.shiftId)     conditions.push(eq(operationsTable.shiftId,     parseInt(String(req.query.shiftId),     10)));
  if (req.query.workplaceId) conditions.push(eq(operationsTable.workplaceId, parseInt(String(req.query.workplaceId), 10)));
  if (req.query.status)      conditions.push(eq(operationsTable.status, String(req.query.status)));
  if (req.query.barcode)     conditions.push(eq(operationsTable.barcode, String(req.query.barcode)));

  const [rows, total] = await Promise.all([
    db.select().from(operationsTable).where(and(...conditions))
      .orderBy(desc(operationsTable.startTime)).limit(limit).offset(offset),
    db.select({ id: operationsTable.id }).from(operationsTable).where(and(...conditions)),
  ]);

  const ids = rows.map(r => r.id);
  const pauses = ids.length > 0
    ? await db.select().from(operationPausesTable).where(inArray(operationPausesTable.operationId, ids))
    : [];

  res.json({ items: rows.map(op => operationToDto(op, pauses.filter(p => p.operationId === op.id))), total: total.length });
});

export default router;
