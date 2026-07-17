import { Router, type IRouter } from "express";
import { and, desc, eq, gte, isNull, lte, or } from "drizzle-orm";
import { db, operationsTable, operationPausesTable, securityLogTable } from "@workspace/db";
import { requireAuth } from "../lib/auth";
import { logSecurity } from "../lib/auth";
import { getWorkstations } from "../lib/ws-server";
import { operationToDto, finalizeOperation, getOperationWithPauses } from "../lib/operation-helper";

const router: IRouter = Router();

// All routes require supervisor or admin role
const auth = requireAuth(["supervisor", "admin"]);

// Real-time workstation status
router.get("/supervisor/workstations", auth, async (_req, res): Promise<void> => {
  res.json(getWorkstations());
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
