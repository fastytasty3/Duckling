import { db, operationsTable, operationPausesTable, productsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { operationToDto, findActiveOperation, finalizeOperation } from "./operation-helper";

type Product   = typeof productsTable.$inferSelect;
type Operation = typeof operationsTable.$inferSelect;
type Pause     = typeof operationPausesTable.$inferSelect;

export type ScanResultStatus =
  | "new_operation"
  | "quantity_incremented"
  | "operation_restarted"
  | "product_unknown";

export interface ScanResult {
  status: ScanResultStatus;
  operation: ReturnType<typeof operationToDto>;
  previousOperation: ReturnType<typeof operationToDto> | null;
  productFound: boolean;
}

export interface OperationContext {
  operatorId: number | undefined;
  shiftId:    number | undefined;
  workplaceId: number | undefined;
  operatorName: string | null;
  shiftName:    string | null;
  workplaceName: string | null;
}

// ---------------------------------------------------------------------------
// Shared insert-values builder — avoids duplicating the big object literal
// ---------------------------------------------------------------------------

function buildInsertValues(
  barcode: string,
  product: Product | undefined,
  ctx: OperationContext,
) {
  return {
    barcode,
    productId:        product?.id ?? null,
    productName:      product?.name ?? null,
    productSku:       product?.sku ?? null,
    productCategory:  product?.category ?? null,
    normTimeSeconds:  product?.normTimeSeconds ?? null,
    operatorId:       ctx.operatorId ?? null,
    shiftId:          ctx.shiftId ?? null,
    workplaceId:      ctx.workplaceId ?? null,
    operatorName:     ctx.operatorName,
    shiftName:        ctx.shiftName,
    workplaceName:    ctx.workplaceName,
    startTime:        new Date(),
    status:           "active" as const,
    quantity:         1,
    pauseDurationSeconds: 0,
  };
}

// ---------------------------------------------------------------------------
// Handle same-barcode in increment_quantity mode
// ---------------------------------------------------------------------------

async function handleIncrement(
  currentActive: { op: Operation; pauses: Pause[] },
): Promise<{ op: Operation; pauses: Pause[] }> {
  const [updated] = await db.update(operationsTable)
    .set({ quantity: currentActive.op.quantity + 1 })
    .where(eq(operationsTable.id, currentActive.op.id))
    .returning();
  return { op: updated, pauses: currentActive.pauses };
}

// ---------------------------------------------------------------------------
// Finalize current operation and start a new one
// ---------------------------------------------------------------------------

async function handleFinalizeAndCreate(
  currentActive: { op: Operation; pauses: Pause[] },
  barcode: string,
  product: Product | undefined,
  ctx: OperationContext,
): Promise<{ previous: ReturnType<typeof operationToDto>; newOp: Operation }> {
  await finalizeOperation(currentActive.op.id);
  const [finalized] = await db.select().from(operationsTable)
    .where(eq(operationsTable.id, currentActive.op.id));
  const finalizedPauses = await db.select().from(operationPausesTable)
    .where(eq(operationPausesTable.operationId, currentActive.op.id));

  const [created] = await db.insert(operationsTable)
    .values(buildInsertValues(barcode, product, ctx))
    .returning();
  return { previous: operationToDto(finalized, finalizedPauses), newOp: created };
}

// ---------------------------------------------------------------------------
// Main scan processor — called by the route handler
// ---------------------------------------------------------------------------

export async function processScan(
  barcode: string,
  resolvedWorkplaceId: number | undefined,
  ctx: OperationContext,
  scanMode: string,
  productFound: boolean,
  product: Product | undefined,
): Promise<ScanResult> {
  const currentActive = await findActiveOperation(resolvedWorkplaceId);

  if (!currentActive) {
    const [created] = await db.insert(operationsTable)
      .values(buildInsertValues(barcode, product, ctx))
      .returning();
    return {
      status: productFound ? "new_operation" : "product_unknown",
      operation: operationToDto(created, []),
      previousOperation: null,
      productFound,
    };
  }

  const isSameBarcode = currentActive.op.barcode === barcode;

  if (isSameBarcode && scanMode === "increment_quantity") {
    const { op, pauses } = await handleIncrement(currentActive);
    return {
      status: "quantity_incremented",
      operation: operationToDto(op, pauses),
      previousOperation: null,
      productFound,
    };
  }

  const { previous, newOp } = await handleFinalizeAndCreate(currentActive, barcode, product, ctx);
  const status: ScanResultStatus = isSameBarcode
    ? "operation_restarted"
    : (productFound ? "new_operation" : "product_unknown");
  return { status, operation: operationToDto(newOp, []), previousOperation: previous, productFound };
}
