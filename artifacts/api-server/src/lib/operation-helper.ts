import { db, operationsTable, operationPausesTable } from "@workspace/db";
import { and, eq, isNull } from "drizzle-orm";

export type OperationWithPauses = typeof operationsTable.$inferSelect & {
  pauses: (typeof operationPausesTable.$inferSelect)[];
};

export function calcNetDuration(
  startTime: Date,
  endTime: Date,
  pauseSeconds: number,
): number {
  const total = Math.round((endTime.getTime() - startTime.getTime()) / 1000);
  return Math.max(0, total - pauseSeconds);
}

export function calcPauseDuration(pauses: { startTime: Date; endTime: Date | null }[], asOf?: Date): number {
  let total = 0;
  const now = asOf ?? new Date();
  for (const p of pauses) {
    const end = p.endTime ?? now;
    total += Math.round((end.getTime() - p.startTime.getTime()) / 1000);
  }
  return total;
}

export function operationToDto(op: typeof operationsTable.$inferSelect, pauses: (typeof operationPausesTable.$inferSelect)[]) {
  return {
    id: op.id,
    productId: op.productId,
    operatorId: op.operatorId,
    shiftId: op.shiftId,
    workplaceId: op.workplaceId,
    barcode: op.barcode,
    productName: op.productName,
    productSku: op.productSku,
    productCategory: op.productCategory,
    operatorName: op.operatorName,
    shiftName: op.shiftName,
    workplaceName: op.workplaceName,
    startTime: op.startTime.toISOString(),
    endTime: op.endTime?.toISOString() ?? null,
    status: op.status,
    quantity: op.quantity,
    netDurationSeconds: op.netDurationSeconds,
    totalDurationSeconds: op.totalDurationSeconds,
    pauseDurationSeconds: op.pauseDurationSeconds,
    normTimeSeconds: op.normTimeSeconds,
    comment: op.comment,
    pauses: pauses.map(p => ({
      id: p.id,
      operationId: p.operationId,
      startTime: p.startTime.toISOString(),
      endTime: p.endTime?.toISOString() ?? null,
    })),
    createdAt: op.createdAt.toISOString(),
  };
}

export async function getOperationWithPauses(id: number) {
  const [op] = await db.select().from(operationsTable).where(eq(operationsTable.id, id));
  if (!op) return null;
  const pauses = await db.select().from(operationPausesTable).where(eq(operationPausesTable.operationId, id));
  return { op, pauses };
}

export async function findActiveOperation(workplaceId?: number) {
  const activeConditions = workplaceId
    ? and(eq(operationsTable.status, "active"), eq(operationsTable.workplaceId, workplaceId))
    : eq(operationsTable.status, "active");

  const [op] = await db.select().from(operationsTable)
    .where(activeConditions)
    .limit(1);
  if (op) {
    const pauses = await db.select().from(operationPausesTable).where(eq(operationPausesTable.operationId, op.id));
    return { op, pauses };
  }

  const pausedConditions = workplaceId
    ? and(eq(operationsTable.status, "paused"), eq(operationsTable.workplaceId, workplaceId))
    : eq(operationsTable.status, "paused");

  const [paused] = await db.select().from(operationsTable)
    .where(pausedConditions)
    .limit(1);
  if (paused) {
    const pauses = await db.select().from(operationPausesTable).where(eq(operationPausesTable.operationId, paused.id));
    return { op: paused, pauses };
  }
  return null;
}

export async function finalizeOperation(id: number): Promise<void> {
  const data = await getOperationWithPauses(id);
  if (!data) return;
  const { op, pauses } = data;
  // Close any open pause
  const openPause = pauses.find(p => !p.endTime);
  if (openPause) {
    await db.update(operationPausesTable).set({ endTime: new Date() }).where(eq(operationPausesTable.id, openPause.id));
    pauses.forEach(p => { if (p.id === openPause.id) p.endTime = new Date(); });
  }
  const now = new Date();
  const pauseSeconds = calcPauseDuration(pauses, now);
  const totalSeconds = Math.round((now.getTime() - op.startTime.getTime()) / 1000);
  const netSeconds = Math.max(0, totalSeconds - pauseSeconds);
  await db.update(operationsTable).set({
    status: "completed",
    endTime: now,
    netDurationSeconds: netSeconds,
    totalDurationSeconds: totalSeconds,
    pauseDurationSeconds: pauseSeconds,
    updatedAt: now,
  }).where(eq(operationsTable.id, id));
}
