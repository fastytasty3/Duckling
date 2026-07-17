import { Router, type IRouter } from "express";
import { and, gte, lte, eq, isNull, desc } from "drizzle-orm";
import { db, operationsTable } from "@workspace/db";
import {
  GetReportSummaryQueryParams,
  GetReportByProductQueryParams,
  GetReportByHourQueryParams,
  GetReportByOperatorQueryParams,
  ExportOperationsQueryParams,
  ExportProductsQueryParams,
} from "@workspace/api-zod";
import { findActiveOperation, operationToDto } from "../lib/operation-helper";
import { db as dbInstance, productsTable, operationPausesTable } from "@workspace/db";

const router: IRouter = Router();

function buildConditions(params: { dateFrom?: string; dateTo?: string; operatorId?: number; shiftId?: number }) {
  const conditions = [isNull(operationsTable.deletedAt), eq(operationsTable.status, "completed") as any];
  if (params.dateFrom) conditions.push(gte(operationsTable.startTime, new Date(params.dateFrom)) as any);
  if (params.dateTo) conditions.push(lte(operationsTable.startTime, new Date(params.dateTo)) as any);
  if (params.operatorId) conditions.push(eq(operationsTable.operatorId, params.operatorId) as any);
  if (params.shiftId) conditions.push(eq(operationsTable.shiftId, params.shiftId) as any);
  return conditions;
}

router.get("/reports/summary", async (req, res): Promise<void> => {
  const params = GetReportSummaryQueryParams.safeParse(req.query);
  const p = params.success ? params.data : {};
  const conditions = buildConditions(p as any);

  const rows = await db.select().from(operationsTable).where(and(...conditions));

  const totalOperations = rows.length;
  const totalUnits = rows.reduce((s, r) => s + r.quantity, 0);
  const totalNetSeconds = rows.reduce((s, r) => s + (r.netDurationSeconds ?? 0), 0);
  const totalPauseSeconds = rows.reduce((s, r) => s + (r.pauseDurationSeconds ?? 0), 0);
  const avgOperationSeconds = totalOperations > 0 ? Math.round(totalNetSeconds / totalOperations) : 0;
  const avgSecondsPerUnit = totalUnits > 0 ? Math.round(totalNetSeconds / totalUnits) : 0;

  const withNorm = rows.filter(r => r.normTimeSeconds != null && r.netDurationSeconds != null);
  const aboveNormCount = withNorm.filter(r => (r.netDurationSeconds ?? 0) > (r.normTimeSeconds ?? 0)).length;
  const belowNormCount = withNorm.filter(r => (r.netDurationSeconds ?? 0) <= (r.normTimeSeconds ?? 0)).length;

  const sorted = [...rows].sort((a, b) => (a.netDurationSeconds ?? 0) - (b.netDurationSeconds ?? 0));
  const fastestProduct = sorted[0]?.productName ?? null;
  const slowestProduct = sorted[sorted.length - 1]?.productName ?? null;

  // Active operation
  const active = await findActiveOperation();
  const activeOp = active ? operationToDto(active.op, active.pauses) : null;

  res.json({
    totalOperations,
    totalUnits,
    totalNetSeconds,
    totalPauseSeconds,
    avgOperationSeconds,
    avgSecondsPerUnit,
    aboveNormCount,
    belowNormCount,
    fastestProduct,
    slowestProduct,
    activeOperation: activeOp,
  });
});

router.get("/reports/by-product", async (req, res): Promise<void> => {
  const params = GetReportByProductQueryParams.safeParse(req.query);
  const p = params.success ? params.data : {};
  const conditions = buildConditions(p as any);

  const rows = await db.select().from(operationsTable).where(and(...conditions));

  // Group by barcode
  const map = new Map<string, typeof rows>();
  for (const r of rows) {
    if (!map.has(r.barcode)) map.set(r.barcode, []);
    map.get(r.barcode)!.push(r);
  }

  const result = Array.from(map.entries()).map(([barcode, ops]) => {
    const netTimes = ops.map(o => o.netDurationSeconds ?? 0).filter(t => t > 0);
    const totalNetSeconds = netTimes.reduce((s, t) => s + t, 0);
    const totalUnits = ops.reduce((s, o) => s + o.quantity, 0);
    const minSeconds = netTimes.length > 0 ? Math.min(...netTimes) : 0;
    const maxSeconds = netTimes.length > 0 ? Math.max(...netTimes) : 0;
    const normTimeSeconds = ops[0]?.normTimeSeconds ?? null;
    const avgOperationSeconds = ops.length > 0 ? Math.round(totalNetSeconds / ops.length) : 0;
    return {
      productId: ops[0]?.productId ?? null,
      barcode,
      sku: ops[0]?.productSku ?? null,
      name: ops[0]?.productName ?? barcode,
      operationCount: ops.length,
      totalUnits,
      totalNetSeconds,
      avgOperationSeconds,
      avgSecondsPerUnit: totalUnits > 0 ? Math.round(totalNetSeconds / totalUnits) : 0,
      minSeconds,
      maxSeconds,
      normTimeSeconds,
      deviationSeconds: normTimeSeconds != null ? avgOperationSeconds - normTimeSeconds : null,
    };
  });

  res.json(result.sort((a, b) => b.operationCount - a.operationCount));
});

router.get("/reports/by-hour", async (req, res): Promise<void> => {
  const params = GetReportByHourQueryParams.safeParse(req.query);
  const p = params.success ? params.data : {};
  const conditions = buildConditions(p as any);
  const rows = await db.select().from(operationsTable).where(and(...conditions));

  const hourMap = new Map<number, { count: number; units: number; totalSeconds: number }>();
  for (let h = 0; h < 24; h++) hourMap.set(h, { count: 0, units: 0, totalSeconds: 0 });

  for (const r of rows) {
    const h = new Date(r.startTime).getHours();
    const entry = hourMap.get(h)!;
    entry.count++;
    entry.units += r.quantity;
    entry.totalSeconds += r.netDurationSeconds ?? 0;
  }

  res.json(Array.from(hourMap.entries()).map(([hour, data]) => ({
    hour,
    operationCount: data.count,
    totalUnits: data.units,
    avgSeconds: data.count > 0 ? Math.round(data.totalSeconds / data.count) : 0,
  })));
});

router.get("/reports/by-operator", async (req, res): Promise<void> => {
  const params = GetReportByOperatorQueryParams.safeParse(req.query);
  const p = params.success ? params.data : {};
  const conds = [isNull(operationsTable.deletedAt), eq(operationsTable.status, "completed") as any];
  if ((p as any).dateFrom) conds.push(gte(operationsTable.startTime, new Date((p as any).dateFrom)) as any);
  if ((p as any).dateTo) conds.push(lte(operationsTable.startTime, new Date((p as any).dateTo)) as any);

  const rows = await db.select().from(operationsTable).where(and(...conds));
  const map = new Map<string, typeof rows>();
  for (const r of rows) {
    const key = r.operatorName ?? "Неизвестный";
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(r);
  }
  const result = Array.from(map.entries()).map(([operatorName, ops]) => {
    const totalNetSeconds = ops.reduce((s, o) => s + (o.netDurationSeconds ?? 0), 0);
    const totalUnits = ops.reduce((s, o) => s + o.quantity, 0);
    return {
      operatorId: ops[0]?.operatorId ?? null,
      operatorName,
      operationCount: ops.length,
      totalUnits,
      totalNetSeconds,
      avgOperationSeconds: ops.length > 0 ? Math.round(totalNetSeconds / ops.length) : 0,
    };
  });
  res.json(result);
});

// Export endpoints
router.get("/export/operations", async (req, res): Promise<void> => {
  const params = ExportOperationsQueryParams.safeParse(req.query);
  const p = params.success ? params.data : {};
  const conditions = [isNull(operationsTable.deletedAt)];
  if ((p as any).dateFrom) conditions.push(gte(operationsTable.startTime, new Date((p as any).dateFrom)) as any);
  if ((p as any).dateTo) conditions.push(lte(operationsTable.startTime, new Date((p as any).dateTo)) as any);

  const rows = await db.select().from(operationsTable).where(and(...conditions)).orderBy(desc(operationsTable.startTime));

  const headers = ["ID","Дата","Смена","Оператор","Рабочее место","Штрихкод","Артикул","Товар","Категория","Начало","Конец","Общее время (сек)","Паузы (сек)","Чистое время (сек)","Кол-во","Сред. время/ед (сек)","Норматив (сек)","Отклонение (сек)","Статус","Комментарий"];
  const csvRows = rows.map(r => [
    r.id, new Date(r.startTime).toLocaleDateString("ru-RU"),
    r.shiftName ?? "", r.operatorName ?? "", r.workplaceName ?? "",
    r.barcode, r.productSku ?? "", r.productName ?? "", r.productCategory ?? "",
    r.startTime.toISOString(), r.endTime?.toISOString() ?? "",
    r.totalDurationSeconds ?? "", r.pauseDurationSeconds ?? "",
    r.netDurationSeconds ?? "", r.quantity,
    r.quantity > 0 && r.netDurationSeconds ? Math.round(r.netDurationSeconds / r.quantity) : "",
    r.normTimeSeconds ?? "",
    r.normTimeSeconds != null && r.netDurationSeconds != null ? (r.netDurationSeconds - r.normTimeSeconds) : "",
    r.status, r.comment ?? "",
  ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(","));

  const csv = [headers.join(","), ...csvRows].join("\n");
  const date = new Date().toISOString().slice(0, 10);
  res.json({ filename: `Отчет_операции_${date}.csv`, mimeType: "text/csv", data: csv });
});

router.get("/export/products", async (req, res): Promise<void> => {
  const rows = await db.select().from(productsTable).where(isNull(productsTable.deletedAt));
  const headers = ["Штрихкод","Артикул","Наименование","Категория","Ед. изм.","Норматив (сек)","Комментарий","Активен"];
  const csvRows = rows.map(r => [
    r.barcode, r.sku ?? "", r.name, r.category ?? "", r.unit ?? "",
    r.normTimeSeconds ?? "", r.comment ?? "", r.active ? "Да" : "Нет",
  ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(","));
  const csv = [headers.join(","), ...csvRows].join("\n");
  const date = new Date().toISOString().slice(0, 10);
  res.json({ filename: `Справочник_товаров_${date}.csv`, mimeType: "text/csv", data: csv });
});

export default router;
