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
  calcPauseDuration,
} from "../lib/operation-helper";
import { getSettingsMap, parseSettings } from "../lib/settings-helper";
import { getSession } from "../lib/session-store";
import { logAction } from "../lib/action-logger";

const router: IRouter = Router();

router.get("/operations", async (req, res): Promise<void> => {
  const params = ListOperationsQueryParams.safeParse(req.query);
  const limit = (params.success && params.data.limit) ? params.data.limit : 50;
  const offset = (params.success && params.data.offset) ? params.data.offset : 0;

  const conditions = [isNull(operationsTable.deletedAt)];
  if (params.success) {
    const p = params.data;
    if (p.dateFrom) conditions.push(gte(operationsTable.startTime, new Date(p.dateFrom)));
    if (p.dateTo) conditions.push(lte(operationsTable.startTime, new Date(p.dateTo)));
    if (p.operatorId) conditions.push(eq(operationsTable.operatorId, p.operatorId));
    if (p.shiftId) conditions.push(eq(operationsTable.shiftId, p.shiftId));
    if (p.workplaceId) conditions.push(eq(operationsTable.workplaceId, p.workplaceId));
    if (p.barcode) conditions.push(eq(operationsTable.barcode, p.barcode));
    if (p.status) conditions.push(eq(operationsTable.status, p.status));
  }

  const rows = await db.select()
    .from(operationsTable)
    .where(and(...conditions))
    .orderBy(desc(operationsTable.startTime))
    .limit(limit)
    .offset(offset);

  // Count total
  const allRows = await db.select({ id: operationsTable.id })
    .from(operationsTable)
    .where(and(...conditions));

  const ids = rows.map(r => r.id);
  let allPauses: (typeof operationPausesTable.$inferSelect)[] = [];
  if (ids.length > 0) {
    allPauses = await db.select().from(operationPausesTable).where(inArray(operationPausesTable.operationId, ids));
  }

  const items = rows.map(op => {
    const pauses = allPauses.filter(p => p.operationId === op.id);
    return operationToDto(op, pauses);
  });

  res.json({ items, total: allRows.length });
});

router.get("/operations/active", async (_req, res): Promise<void> => {
  const active = await findActiveOperation();
  if (!active) {
    res.json({ operation: null });
    return;
  }
  res.json({ operation: operationToDto(active.op, active.pauses) });
});

router.post("/operations/scan", async (req, res): Promise<void> => {
  const parsed = ProcessBarcodeScanBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { barcode } = parsed.data;
  const session = getSession();
  const settingsMap = await getSettingsMap();
  const settings = parseSettings(settingsMap);

  const operatorId = parsed.data.operatorId ?? session.operatorId ?? undefined;
  const shiftId = parsed.data.shiftId ?? session.shiftId ?? undefined;
  const workplaceId = parsed.data.workplaceId ?? session.workplaceId ?? undefined;

  // Look up product
  const [product] = await db.select().from(productsTable).where(eq(productsTable.barcode, barcode));

  const productFound = !!product;

  // Find currently active operation
  const currentActive = await findActiveOperation();

  let resultStatus: "new_operation" | "quantity_incremented" | "operation_restarted" | "product_unknown";
  let previousOperation = null;
  let newOp: typeof operationsTable.$inferSelect;
  let newPauses: (typeof operationPausesTable.$inferSelect)[] = [];

  if (currentActive) {
    const isSameBarcode = currentActive.op.barcode === barcode;

    if (isSameBarcode && settings.scanMode === "increment_quantity") {
      // Increment quantity
      const [updated] = await db.update(operationsTable)
        .set({ quantity: currentActive.op.quantity + 1 })
        .where(eq(operationsTable.id, currentActive.op.id))
        .returning();
      newOp = updated;
      newPauses = currentActive.pauses;
      resultStatus = "quantity_incremented";
    } else {
      // Finalize current operation
      await finalizeOperation(currentActive.op.id);
      const [finalized] = await db.select().from(operationsTable).where(eq(operationsTable.id, currentActive.op.id));
      const finalizedPauses = await db.select().from(operationPausesTable).where(eq(operationPausesTable.operationId, currentActive.op.id));
      previousOperation = operationToDto(finalized, finalizedPauses);

      // Create new operation
      const now = new Date();
      const [created] = await db.insert(operationsTable).values({
        barcode,
        productId: product?.id ?? null,
        productName: product?.name ?? null,
        productSku: product?.sku ?? null,
        productCategory: product?.category ?? null,
        normTimeSeconds: product?.normTimeSeconds ?? null,
        operatorId: operatorId ?? null,
        shiftId: shiftId ?? null,
        workplaceId: workplaceId ?? null,
        operatorName: session.operatorName,
        shiftName: session.shiftName,
        workplaceName: session.workplaceName,
        startTime: now,
        status: "active",
        quantity: 1,
        pauseDurationSeconds: 0,
      }).returning();
      newOp = created;
      resultStatus = isSameBarcode ? "operation_restarted" : (productFound ? "new_operation" : "product_unknown");
    }
  } else {
    // No active operation — create new one
    const now = new Date();
    const [created] = await db.insert(operationsTable).values({
      barcode,
      productId: product?.id ?? null,
      productName: product?.name ?? null,
      productSku: product?.sku ?? null,
      productCategory: product?.category ?? null,
      normTimeSeconds: product?.normTimeSeconds ?? null,
      operatorId: operatorId ?? null,
      shiftId: shiftId ?? null,
      workplaceId: workplaceId ?? null,
      operatorName: session.operatorName,
      shiftName: session.shiftName,
      workplaceName: session.workplaceName,
      startTime: now,
      status: "active",
      quantity: 1,
      pauseDurationSeconds: 0,
    }).returning();
    newOp = created;
    resultStatus = productFound ? "new_operation" : "product_unknown";
  }

  await logAction(db, operatorId ?? null, session.operatorName, "scan", `Сканирован: ${barcode}`);

  res.json({
    status: resultStatus,
    operation: operationToDto(newOp, newPauses),
    previousOperation,
    productFound,
  });
});

router.get("/operations/:id", async (req, res): Promise<void> => {
  const params = GetOperationParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const data = await getOperationWithPauses(params.data.id);
  if (!data) { res.status(404).json({ error: "Операция не найдена" }); return; }
  res.json(operationToDto(data.op, data.pauses));
});

router.patch("/operations/:id", async (req, res): Promise<void> => {
  const params = UpdateOperationParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateOperationBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const updates: Record<string, unknown> = {};
  const d = parsed.data;
  if (d.productId !== undefined) updates.productId = d.productId;
  if (d.quantity !== undefined) updates.quantity = d.quantity;
  if (d.startTime !== undefined) updates.startTime = new Date(d.startTime);
  if (d.endTime !== undefined) updates.endTime = new Date(d.endTime);
  if (d.comment !== undefined) updates.comment = d.comment;
  const [op] = await db.update(operationsTable).set(updates).where(eq(operationsTable.id, params.data.id)).returning();
  if (!op) { res.status(404).json({ error: "Операция не найдена" }); return; }
  const pauses = await db.select().from(operationPausesTable).where(eq(operationPausesTable.operationId, op.id));
  res.json(operationToDto(op, pauses));
});

router.delete("/operations/:id", async (req, res): Promise<void> => {
  const params = DeleteOperationParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  await db.update(operationsTable).set({ deletedAt: new Date() }).where(eq(operationsTable.id, params.data.id));
  res.json({ ok: true });
});

router.post("/operations/:id/stop", async (req, res): Promise<void> => {
  const params = StopOperationParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  await finalizeOperation(params.data.id);
  const data = await getOperationWithPauses(params.data.id);
  if (!data) { res.status(404).json({ error: "Операция не найдена" }); return; }
  res.json(operationToDto(data.op, data.pauses));
});

router.post("/operations/:id/pause", async (req, res): Promise<void> => {
  const params = PauseOperationParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [op] = await db.select().from(operationsTable).where(eq(operationsTable.id, params.data.id));
  if (!op || op.status !== "active") { res.status(400).json({ error: "Операция не активна" }); return; }
  await db.update(operationsTable).set({ status: "paused" }).where(eq(operationsTable.id, op.id));
  await db.insert(operationPausesTable).values({ operationId: op.id, startTime: new Date() });
  const data = await getOperationWithPauses(params.data.id);
  if (!data) { res.status(404).json({ error: "Операция не найдена" }); return; }
  res.json(operationToDto(data.op, data.pauses));
});

router.post("/operations/:id/resume", async (req, res): Promise<void> => {
  const params = ResumeOperationParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [op] = await db.select().from(operationsTable).where(eq(operationsTable.id, params.data.id));
  if (!op || op.status !== "paused") { res.status(400).json({ error: "Операция не на паузе" }); return; }
  // Close open pause
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

router.patch("/operations/:id/quantity", async (req, res): Promise<void> => {
  const params = UpdateOperationQuantityParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateOperationQuantityBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [op] = await db.select().from(operationsTable).where(eq(operationsTable.id, params.data.id));
  if (!op) { res.status(404).json({ error: "Операция не найдена" }); return; }
  const newQty = parsed.data.quantity !== undefined
    ? parsed.data.quantity
    : Math.max(1, op.quantity + (parsed.data.delta ?? 1));
  const [updated] = await db.update(operationsTable).set({ quantity: newQty }).where(eq(operationsTable.id, op.id)).returning();
  const pauses = await db.select().from(operationPausesTable).where(eq(operationPausesTable.operationId, op.id));
  res.json(operationToDto(updated, pauses));
});

export default router;
