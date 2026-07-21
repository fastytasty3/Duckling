import { Router, type IRouter } from "express";
import { eq, and, isNull, gte, lte, desc, inArray } from "drizzle-orm";
import { db, operationsTable, operationPausesTable, productsTable } from "@workspace/db";
import {
  ListOperationsQueryParams,
  GetOperationParams,
  UpdateOperationParams,
  UpdateOperationBody,
  DeleteOperationParams,
  StopOperationParams,
  PauseOperationParams,
  ResumeOperationParams,
  UpdateOperationQuantityParams,
  UpdateOperationQuantityBody,
  ProcessBarcodeScanBody,
} from "@workspace/api-zod";
import {
  operationToDto,
  getOperationWithPauses,
  findActiveOperation,
  finalizeOperation,
} from "../lib/operation-helper";
import { getSettingsMap, parseSettings } from "../lib/settings-helper";
import { getSession } from "../lib/session-store";
import { logAction } from "../lib/action-logger";
import { requireAuth } from "../lib/auth";
import { getRequestWorkplaceId, resolveOperationForWorkplace } from "../lib/scope";
import { processScan, type OperationContext } from "../lib/scan-handler";

const router: IRouter = Router();

// ---------------------------------------------------------------------------
// List operations
// ---------------------------------------------------------------------------

router.get("/operations", async (req, res): Promise<void> => {
  const params = ListOperationsQueryParams.safeParse(req.query);
  const limit  = (params.success && params.data.limit)  ? params.data.limit  : 50;
  const offset = (params.success && params.data.offset) ? params.data.offset : 0;

  const conditions = [isNull(operationsTable.deletedAt)];
  if (params.success) {
    const p = params.data;
    if (p.dateFrom)    conditions.push(gte(operationsTable.startTime,  new Date(p.dateFrom)));
    if (p.dateTo)      conditions.push(lte(operationsTable.startTime,  new Date(p.dateTo)));
    if (p.operatorId)  conditions.push(eq(operationsTable.operatorId,  p.operatorId));
    if (p.shiftId)     conditions.push(eq(operationsTable.shiftId,     p.shiftId));
    if (p.workplaceId) conditions.push(eq(operationsTable.workplaceId, p.workplaceId));
    if (p.barcode)     conditions.push(eq(operationsTable.barcode,     p.barcode));
    if (p.status)      conditions.push(eq(operationsTable.status,      p.status));
  }

  const [rows, allRows] = await Promise.all([
    db.select().from(operationsTable).where(and(...conditions))
      .orderBy(desc(operationsTable.startTime)).limit(limit).offset(offset),
    db.select({ id: operationsTable.id }).from(operationsTable).where(and(...conditions)),
  ]);

  const ids = rows.map(r => r.id);
  const allPauses = ids.length > 0
    ? await db.select().from(operationPausesTable).where(inArray(operationPausesTable.operationId, ids))
    : [];

  res.json({ items: rows.map(op => operationToDto(op, allPauses.filter(p => p.operationId === op.id))), total: allRows.length });
});

// ---------------------------------------------------------------------------
// Active operation for this workplace
// ---------------------------------------------------------------------------

router.get("/operations/active", async (req, res): Promise<void> => {
  const rawId = req.headers["x-workplace-id"] ?? (req.query as any)?.workplaceId;
  const workplaceId = rawId ? (parseInt(String(rawId), 10) || undefined) : undefined;
  const active = await findActiveOperation(workplaceId);
  if (!active) { res.json({ operation: null }); return; }
  res.json({ operation: operationToDto(active.op, active.pauses) });
});

// ---------------------------------------------------------------------------
// Barcode scan
// ---------------------------------------------------------------------------

router.post("/operations/scan", async (req, res): Promise<void> => {
  const parsed = ProcessBarcodeScanBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { barcode } = parsed.data;
  const headerWpId = req.headers["x-workplace-id"];
  const resolvedWorkplaceId = parsed.data.workplaceId
    ?? (headerWpId ? parseInt(String(headerWpId), 10) || undefined : undefined);

  const session = resolvedWorkplaceId
    ? getSession(resolvedWorkplaceId)
    : { operatorId: null, operatorName: null, shiftId: null, shiftName: null, workplaceId: null, workplaceName: null, zone: null, shift: null };

  const ctx: OperationContext = {
    operatorId:   parsed.data.operatorId  ?? session.operatorId  ?? undefined,
    shiftId:      parsed.data.shiftId     ?? session.shiftId     ?? undefined,
    workplaceId:  parsed.data.workplaceId ?? session.workplaceId ?? undefined,
    operatorName:  session.operatorName,
    shiftName:     session.shiftName,
    workplaceName: session.workplaceName,
  };

  const settingsMap = await getSettingsMap();
  const { scanMode } = parseSettings(settingsMap);

  const [product] = await db.select().from(productsTable).where(eq(productsTable.barcode, barcode));
  const result = await processScan(barcode, resolvedWorkplaceId, ctx, scanMode, !!product, product);

  await logAction(db, ctx.operatorId ?? null, session.operatorName, "scan", `Сканирован: ${barcode}`);
  res.json(result);
});

// ---------------------------------------------------------------------------
// Get operation by id
// ---------------------------------------------------------------------------

router.get("/operations/:id", async (req, res): Promise<void> => {
  const params = GetOperationParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const wpId = getRequestWorkplaceId(req);
  if (wpId !== null) {
    const scoped = await resolveOperationForWorkplace(params.data.id, wpId);
    if (!scoped) { res.status(403).json({ error: "Доступ запрещён" }); return; }
  }

  const data = await getOperationWithPauses(params.data.id);
  if (!data) { res.status(404).json({ error: "Операция не найдена" }); return; }
  res.json(operationToDto(data.op, data.pauses));
});

// ---------------------------------------------------------------------------
// Update operation (supervisor/admin only)
// ---------------------------------------------------------------------------

router.patch("/operations/:id", requireAuth(["supervisor", "admin"]), async (req, res): Promise<void> => {
  const params = UpdateOperationParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateOperationBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const d = parsed.data;
  const updates: Record<string, unknown> = {};
  if (d.productId !== undefined) updates.productId = d.productId;
  if (d.quantity  !== undefined) updates.quantity  = d.quantity;
  if (d.startTime !== undefined) updates.startTime = new Date(d.startTime);
  if (d.endTime   !== undefined) updates.endTime   = new Date(d.endTime);
  if (d.comment   !== undefined) updates.comment   = d.comment;

  const [op] = await db.update(operationsTable).set(updates)
    .where(eq(operationsTable.id, params.data.id)).returning();
  if (!op) { res.status(404).json({ error: "Операция не найдена" }); return; }

  const pauses = await db.select().from(operationPausesTable).where(eq(operationPausesTable.operationId, op.id));
  res.json(operationToDto(op, pauses));
});

// ---------------------------------------------------------------------------
// Delete operation (admin only)
// ---------------------------------------------------------------------------

router.delete("/operations/:id", requireAuth(["admin"]), async (req, res): Promise<void> => {
  const params = DeleteOperationParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  await db.update(operationsTable).set({ deletedAt: new Date() }).where(eq(operationsTable.id, params.data.id));
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Stop operation
// ---------------------------------------------------------------------------

router.post("/operations/:id/stop", async (req, res): Promise<void> => {
  const params = StopOperationParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const wpId = getRequestWorkplaceId(req);
  if (wpId !== null) {
    const scoped = await resolveOperationForWorkplace(params.data.id, wpId);
    if (!scoped) { res.status(403).json({ error: "Доступ запрещён" }); return; }
  }

  await finalizeOperation(params.data.id);
  const data = await getOperationWithPauses(params.data.id);
  if (!data) { res.status(404).json({ error: "Операция не найдена" }); return; }
  res.json(operationToDto(data.op, data.pauses));
});

// ---------------------------------------------------------------------------
// Pause operation
// ---------------------------------------------------------------------------

router.post("/operations/:id/pause", async (req, res): Promise<void> => {
  const params = PauseOperationParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const wpId = getRequestWorkplaceId(req);
  if (wpId !== null) {
    const scoped = await resolveOperationForWorkplace(params.data.id, wpId);
    if (!scoped) { res.status(403).json({ error: "Доступ запрещён" }); return; }
  }

  const [op] = await db.select().from(operationsTable).where(eq(operationsTable.id, params.data.id));
  if (!op || op.status !== "active") { res.status(400).json({ error: "Операция не активна" }); return; }

  await db.update(operationsTable).set({ status: "paused" }).where(eq(operationsTable.id, op.id));
  await db.insert(operationPausesTable).values({ operationId: op.id, startTime: new Date() });

  const data = await getOperationWithPauses(params.data.id);
  if (!data) { res.status(404).json({ error: "Операция не найдена" }); return; }
  res.json(operationToDto(data.op, data.pauses));
});

// ---------------------------------------------------------------------------
// Resume operation
// ---------------------------------------------------------------------------

router.post("/operations/:id/resume", async (req, res): Promise<void> => {
  const params = ResumeOperationParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const wpId = getRequestWorkplaceId(req);
  if (wpId !== null) {
    const scoped = await resolveOperationForWorkplace(params.data.id, wpId);
    if (!scoped) { res.status(403).json({ error: "Доступ запрещён" }); return; }
  }

  const [op] = await db.select().from(operationsTable).where(eq(operationsTable.id, params.data.id));
  if (!op || op.status !== "paused") { res.status(400).json({ error: "Операция не на паузе" }); return; }

  const pauses = await db.select().from(operationPausesTable).where(eq(operationPausesTable.operationId, op.id));
  const openPause = pauses.find(p => !p.endTime);
  if (openPause) {
    await db.update(operationPausesTable).set({ endTime: new Date() }).where(eq(operationPausesTable.id, openPause.id));
  }
  await db.update(operationsTable).set({ status: "active" }).where(eq(operationsTable.id, op.id));

  const data = await getOperationWithPauses(params.data.id);
  if (!data) { res.status(404).json({ error: "Операция не найдена" }); return; }
  res.json(operationToDto(data.op, data.pauses));
});

// ---------------------------------------------------------------------------
// Update quantity
// ---------------------------------------------------------------------------

router.patch("/operations/:id/quantity", async (req, res): Promise<void> => {
  const params = UpdateOperationQuantityParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateOperationQuantityBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const wpId = getRequestWorkplaceId(req);
  if (wpId !== null) {
    const scoped = await resolveOperationForWorkplace(params.data.id, wpId);
    if (!scoped) { res.status(403).json({ error: "Доступ запрещён" }); return; }
  }

  const [op] = await db.select().from(operationsTable).where(eq(operationsTable.id, params.data.id));
  if (!op) { res.status(404).json({ error: "Операция не найдена" }); return; }

  const newQty = parsed.data.quantity !== undefined
    ? parsed.data.quantity
    : Math.max(1, op.quantity + (parsed.data.delta ?? 1));

  const [updated] = await db.update(operationsTable).set({ quantity: newQty })
    .where(eq(operationsTable.id, op.id)).returning();
  const opPauses = await db.select().from(operationPausesTable).where(eq(operationPausesTable.operationId, op.id));
  res.json(operationToDto(updated, opPauses));
});

export default router;
