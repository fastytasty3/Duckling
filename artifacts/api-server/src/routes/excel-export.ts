import { Router, type IRouter } from "express";
import { and, desc, eq, gte, isNull, lte, between } from "drizzle-orm";
import { db, operationsTable, operationPausesTable, workplacesTable, attendanceLogsTable } from "@workspace/db";
import { requireAuth, logSecurity } from "../lib/auth";
import ExcelJS from "exceljs";

const router: IRouter = Router();
const auth = requireAuth(["supervisor", "admin"]);

function secToExcelDuration(totalSeconds: number | null | undefined): number {
  if (!totalSeconds || totalSeconds <= 0) return 0;
  // Excel stores durations as fraction of a day
  return totalSeconds / 86400;
}

function applyHeaderStyle(row: ExcelJS.Row, fill: string = "1F3864"): void {
  row.eachCell(cell => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${fill}` } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = {
      top: { style: "thin" }, bottom: { style: "thin" },
      left: { style: "thin" }, right: { style: "thin" },
    };
  });
  row.height = 30;
}

function applyDataRow(row: ExcelJS.Row): void {
  row.eachCell({ includeEmpty: true }, cell => {
    cell.border = {
      top: { style: "hair" }, bottom: { style: "hair" },
      left: { style: "hair" }, right: { style: "hair" },
    };
  });
}

function autoWidth(sheet: ExcelJS.Worksheet): void {
  sheet.columns.forEach(col => {
    let max = 10;
    col.eachCell?.({ includeEmpty: false }, cell => {
      const len = String(cell.value ?? "").length;
      if (len > max) max = len;
    });
    col.width = Math.min(max + 2, 50);
  });
}

function buildConditions(q: Record<string, any>) {
  const conds: any[] = [isNull(operationsTable.deletedAt)];
  if (q.dateFrom) conds.push(gte(operationsTable.startTime, new Date(q.dateFrom)));
  if (q.dateTo) conds.push(lte(operationsTable.startTime, new Date(q.dateTo)));
  if (q.operatorId) conds.push(eq(operationsTable.operatorId, parseInt(q.operatorId, 10)));
  if (q.shiftId) conds.push(eq(operationsTable.shiftId, parseInt(q.shiftId, 10)));
  if (q.workplaceId) conds.push(eq(operationsTable.workplaceId, parseInt(q.workplaceId, 10)));
  if (q.barcode) conds.push(eq(operationsTable.barcode, q.barcode));
  if (q.status) conds.push(eq(operationsTable.status, q.status));
  return conds;
}

router.get("/supervisor/export/excel", auth, async (req, res): Promise<void> => {
  const sv = (req as any).supervisor;
  const q = req.query as Record<string, any>;
  const conds = buildConditions(q);

  const rows = await db.select().from(operationsTable)
    .where(and(...conds))
    .orderBy(desc(operationsTable.startTime));

  // Get all pauses
  const { inArray } = await import("drizzle-orm");
  let allPauses: (typeof operationPausesTable.$inferSelect)[] = [];
  if (rows.length > 0) {
    allPauses = await db.select().from(operationPausesTable)
      .where(inArray(operationPausesTable.operationId, rows.map(r => r.id)));
  }

  const wb = new ExcelJS.Workbook();
  wb.creator = sv.login;
  wb.created = new Date();

  // ── Sheet 1: Общая сводка ──────────────────────────────────────────
  const s1 = wb.addWorksheet("Общая сводка");
  const completed = rows.filter(r => r.status === "completed");
  const uniqueOperators = new Set(rows.map(r => r.operatorId).filter(Boolean));
  const uniqueWorkplaces = new Set(rows.map(r => r.workplaceId).filter(Boolean));
  const totalNet = completed.reduce((s, r) => s + (r.netDurationSeconds ?? 0), 0);
  const totalPause = completed.reduce((s, r) => s + (r.pauseDurationSeconds ?? 0), 0);
  const totalUnits = completed.reduce((s, r) => s + r.quantity, 0);
  const aboveNorm = completed.filter(r => r.normTimeSeconds != null && (r.netDurationSeconds ?? 0) > r.normTimeSeconds!).length;
  const belowNorm = completed.filter(r => r.normTimeSeconds != null && (r.netDurationSeconds ?? 0) <= r.normTimeSeconds!).length;

  const periodFrom = q.dateFrom ? new Date(q.dateFrom).toLocaleDateString("ru-RU") : "—";
  const periodTo = q.dateTo ? new Date(q.dateTo).toLocaleDateString("ru-RU") : "—";

  s1.addRow(["Параметр", "Значение"]);
  applyHeaderStyle(s1.lastRow!, "B8860B");
  const s1Data: [string, any][] = [
    ["Период отчёта", `${periodFrom} — ${periodTo}`],
    ["Количество активных столов", uniqueWorkplaces.size],
    ["Количество операторов", uniqueOperators.size],
    ["Количество завершённых операций", completed.length],
    ["Количество обработанных единиц", totalUnits],
    ["Общее чистое время работы (чч:мм:сс)", new Date(totalNet * 1000).toISOString().slice(11, 19)],
    ["Общее время пауз (чч:мм:сс)", new Date(totalPause * 1000).toISOString().slice(11, 19)],
    ["Среднее время обработки единицы (сек)", totalUnits > 0 ? Math.round(totalNet / totalUnits) : 0],
    ["Операций выше норматива", aboveNorm],
    ["Операций ниже/в норматив", belowNorm],
  ];
  for (const [k, v] of s1Data) {
    const r = s1.addRow([k, v]);
    applyDataRow(r);
  }
  autoWidth(s1);

  // ── Sheet 2: Операции ─────────────────────────────────────────────
  const s2 = wb.addWorksheet("Операции");
  const s2Headers = ["Дата","Смена","Подразделение","Рабочий стол","ФИО оператора","Таб. №","Штрихкод","Артикул","Наименование товара","Категория","Начало","Окончание","Общая длительность","Длительность пауз","Чистое время","Кол-во","Ср. время/ед (сек)","Норматив (сек)","Откл. (сек)","Откл. (%)","Статус","Комм. оператора","Комм. контролёра"];
  s2.addRow(s2Headers);
  applyHeaderStyle(s2.lastRow!);
  s2.views = [{ state: "frozen", ySplit: 1 }];
  s2.autoFilter = { from: "A1", to: `W1` };

  for (const op of rows) {
    const norm = op.normTimeSeconds;
    const net = op.netDurationSeconds ?? 0;
    const devSec = norm != null ? net - norm : null;
    const devPct = norm != null && norm > 0 ? (net - norm) / norm : null;
    const avgPerUnit = op.quantity > 0 && net > 0 ? Math.round(net / op.quantity) : null;
    const r = s2.addRow([
      op.startTime, op.shiftName ?? "", op.operatorDepartment ?? "",
      op.workplaceName ?? "", op.operatorName ?? "", op.operatorTabNumber ?? "",
      op.barcode, op.productSku ?? "", op.productName ?? "", op.productCategory ?? "",
      op.startTime, op.endTime ?? null,
      secToExcelDuration(op.totalDurationSeconds),
      secToExcelDuration(op.pauseDurationSeconds),
      secToExcelDuration(net),
      op.quantity, avgPerUnit, norm, devSec, devPct != null ? devPct : null,
      op.status, op.comment ?? "", op.supervisorComment ?? "",
    ]);
    applyDataRow(r);
    // Date/time formats
    r.getCell(1).numFmt = "DD.MM.YYYY";
    r.getCell(11).numFmt = "DD.MM.YYYY HH:MM:SS";
    r.getCell(12).numFmt = "DD.MM.YYYY HH:MM:SS";
    r.getCell(13).numFmt = "[ч]:мм:сс";
    r.getCell(14).numFmt = "[ч]:мм:сс";
    r.getCell(15).numFmt = "[ч]:мм:сс";
    if (devPct != null) r.getCell(20).numFmt = "0.00%";
    // Conditional formatting — red if above norm
    if (devSec != null && devSec > 0) {
      r.getCell(19).font = { color: { argb: "FFCC0000" } };
      r.getCell(20).font = { color: { argb: "FFCC0000" } };
    }
  }
  s2.addRow(["ИТОГО", "", "", "", "", "", "", "", "", "", "", "",
    secToExcelDuration(completed.reduce((s,r)=>s+(r.totalDurationSeconds??0),0)),
    secToExcelDuration(completed.reduce((s,r)=>s+(r.pauseDurationSeconds??0),0)),
    secToExcelDuration(totalNet),
    totalUnits]);
  const totRow = s2.lastRow!;
  totRow.font = { bold: true };
  totRow.getCell(13).numFmt = "[ч]:мм:сс";
  totRow.getCell(14).numFmt = "[ч]:мм:сс";
  totRow.getCell(15).numFmt = "[ч]:мм:сс";
  autoWidth(s2);

  // ── Sheet 3: По операторам ────────────────────────────────────────
  const s3 = wb.addWorksheet("По операторам");
  s3.addRow(["ФИО","Таб. №","Кол-во смен","Кол-во операций","Кол-во единиц","Чистое время","Время пауз","Ср. время операции","Ср. время/ед","Выполнение норматива","Операций с превышением"]);
  applyHeaderStyle(s3.lastRow!);
  s3.views = [{ state: "frozen", ySplit: 1 }];

  const opMap = new Map<string, typeof rows>();
  for (const r of completed) {
    const k = r.operatorName ?? "Неизвестный";
    if (!opMap.has(k)) opMap.set(k, []);
    opMap.get(k)!.push(r);
  }
  for (const [name, ops] of opMap) {
    const net = ops.reduce((s, r) => s + (r.netDurationSeconds ?? 0), 0);
    const pause = ops.reduce((s, r) => s + (r.pauseDurationSeconds ?? 0), 0);
    const units = ops.reduce((s, r) => s + r.quantity, 0);
    const withNorm = ops.filter(r => r.normTimeSeconds != null);
    const inNorm = withNorm.filter(r => (r.netDurationSeconds ?? 0) <= r.normTimeSeconds!).length;
    const aboveNormOp = withNorm.filter(r => (r.netDurationSeconds ?? 0) > r.normTimeSeconds!).length;
    const normPct = withNorm.length > 0 ? inNorm / withNorm.length : null;
    const uniqueShifts = new Set(ops.map(r => `${r.shiftId}_${r.startTime.toDateString()}`)).size;
    const row = s3.addRow([
      name, ops[0]?.operatorTabNumber ?? "", uniqueShifts, ops.length, units,
      secToExcelDuration(net), secToExcelDuration(pause),
      secToExcelDuration(ops.length > 0 ? Math.round(net / ops.length) : 0),
      secToExcelDuration(units > 0 ? Math.round(net / units) : 0),
      normPct, aboveNormOp,
    ]);
    applyDataRow(row);
    row.getCell(6).numFmt = "[ч]:мм:сс";
    row.getCell(7).numFmt = "[ч]:мм:сс";
    row.getCell(8).numFmt = "[ч]:мм:сс";
    row.getCell(9).numFmt = "[ч]:мм:сс";
    if (normPct != null) row.getCell(10).numFmt = "0.0%";
  }
  autoWidth(s3);

  // ── Sheet 4: По рабочим столам ────────────────────────────────────
  const s4 = wb.addWorksheet("По рабочим столам");
  s4.addRow(["Рабочий стол","Подразделение","Операторов","Операций","Единиц","Суммарное время","Ср. время обработки","Первая операция","Последняя операция"]);
  applyHeaderStyle(s4.lastRow!);
  s4.views = [{ state: "frozen", ySplit: 1 }];

  const wpMap = new Map<string, typeof rows>();
  for (const r of completed) {
    const k = r.workplaceName ?? "Неизвестно";
    if (!wpMap.has(k)) wpMap.set(k, []);
    wpMap.get(k)!.push(r);
  }
  for (const [name, ops] of wpMap) {
    const net = ops.reduce((s, r) => s + (r.netDurationSeconds ?? 0), 0);
    const units = ops.reduce((s, r) => s + r.quantity, 0);
    const uniqueOps = new Set(ops.map(r => r.operatorId)).size;
    const times = ops.map(r => r.startTime.getTime()).sort((a,b)=>a-b);
    const row = s4.addRow([
      name, "", uniqueOps, ops.length, units,
      secToExcelDuration(net),
      secToExcelDuration(ops.length > 0 ? Math.round(net / ops.length) : 0),
      times.length > 0 ? new Date(times[0]) : null,
      times.length > 0 ? new Date(times[times.length - 1]) : null,
    ]);
    applyDataRow(row);
    row.getCell(6).numFmt = "[ч]:мм:сс";
    row.getCell(7).numFmt = "[ч]:мм:сс";
    row.getCell(8).numFmt = "DD.MM.YYYY HH:MM";
    row.getCell(9).numFmt = "DD.MM.YYYY HH:MM";
  }
  autoWidth(s4);

  // ── Sheet 5: По товарам ───────────────────────────────────────────
  const s5 = wb.addWorksheet("По товарам");
  s5.addRow(["Штрихкод","Артикул","Наименование","Категория","Операций","Единиц","Мин. время (сек)","Макс. время (сек)","Ср. время (сек)","Норматив (сек)","Ср. откл. (сек)","Операторов"]);
  applyHeaderStyle(s5.lastRow!);
  s5.views = [{ state: "frozen", ySplit: 1 }];

  const barcodeMap = new Map<string, typeof rows>();
  for (const r of completed) {
    if (!barcodeMap.has(r.barcode)) barcodeMap.set(r.barcode, []);
    barcodeMap.get(r.barcode)!.push(r);
  }
  for (const [barcode, ops] of barcodeMap) {
    const nets = ops.map(r => r.netDurationSeconds ?? 0).filter(n => n > 0);
    const avg = nets.length > 0 ? Math.round(nets.reduce((s,n)=>s+n,0)/nets.length) : 0;
    const norm = ops[0]?.normTimeSeconds ?? null;
    const uniqueOps = new Set(ops.map(r => r.operatorId)).size;
    const row = s5.addRow([
      barcode, ops[0]?.productSku ?? "", ops[0]?.productName ?? barcode,
      ops[0]?.productCategory ?? "", ops.length,
      ops.reduce((s, r) => s + r.quantity, 0),
      nets.length > 0 ? Math.min(...nets) : null,
      nets.length > 0 ? Math.max(...nets) : null,
      avg, norm, norm != null ? avg - norm : null, uniqueOps,
    ]);
    applyDataRow(row);
    // Red if avg above norm
    if (norm != null && avg > norm) {
      row.getCell(11).font = { color: { argb: "FFCC0000" } };
    }
  }
  autoWidth(s5);

  // ── Sheet 6: Паузы ────────────────────────────────────────────────
  const s6 = wb.addWorksheet("Паузы и простои");
  s6.addRow(["Дата","Смена","Рабочий стол","Оператор","Начало паузы","Окончание паузы","Продолжительность","Комментарий"]);
  applyHeaderStyle(s6.lastRow!);
  s6.views = [{ state: "frozen", ySplit: 1 }];

  const opIds = rows.map(r => r.id);
  let pauses: (typeof operationPausesTable.$inferSelect)[] = [];
  if (opIds.length > 0) {
    const { inArray } = await import("drizzle-orm");
    pauses = await db.select().from(operationPausesTable)
      .where(inArray(operationPausesTable.operationId, opIds));
  }

  for (const p of pauses) {
    const op = rows.find(r => r.id === p.operationId);
    if (!op) continue;
    const durSec = p.endTime ? Math.round((p.endTime.getTime() - p.startTime.getTime()) / 1000) : null;
    const row = s6.addRow([
      op.startTime, op.shiftName ?? "", op.workplaceName ?? "", op.operatorName ?? "",
      p.startTime, p.endTime ?? null, durSec != null ? secToExcelDuration(durSec) : null, "",
    ]);
    applyDataRow(row);
    row.getCell(1).numFmt = "DD.MM.YYYY";
    row.getCell(5).numFmt = "DD.MM.YYYY HH:MM:SS";
    row.getCell(6).numFmt = "DD.MM.YYYY HH:MM:SS";
    row.getCell(7).numFmt = "[ч]:мм:сс";
  }
  autoWidth(s6);

  // ── Sheet 7: Проблемные операции ─────────────────────────────────
  const s7 = wb.addWorksheet("Проблемные операции");
  s7.addRow(["Дата","Оператор","Рабочий стол","Штрихкод","Товар","Начало","Статус","Причина","Комментарий контролёра"]);
  applyHeaderStyle(s7.lastRow!, "8B0000");
  s7.views = [{ state: "frozen", ySplit: 1 }];

  const problematic = rows.filter(r =>
    r.isFlagged || r.completedBySupervisor || r.timeManuallyEdited ||
    r.deletedAt != null || r.status === "active" /* stuck */
  );
  for (const op of problematic) {
    const reasons: string[] = [];
    if (op.isFlagged) reasons.push("Помечена контролёром");
    if (op.completedBySupervisor) reasons.push("Завершена контролёром");
    if (op.timeManuallyEdited) reasons.push("Время отредактировано вручную");
    if (op.deletedAt) reasons.push("Удалена");
    if (op.status === "active") reasons.push("Зависшая операция");
    if (op.flagReason) reasons.push(op.flagReason);
    const row = s7.addRow([
      op.startTime, op.operatorName ?? "", op.workplaceName ?? "",
      op.barcode, op.productName ?? "", op.startTime, op.status,
      reasons.join("; "), op.supervisorComment ?? "",
    ]);
    applyDataRow(row);
    row.getCell(1).numFmt = "DD.MM.YYYY";
    row.getCell(6).numFmt = "DD.MM.YYYY HH:MM:SS";
    row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF0F0" } };
  }
  autoWidth(s7);

  // ── Sheet 8: Явка сотрудников ─────────────────────────────────────
  const s8 = wb.addWorksheet("Явка сотрудников");
  s8.addRow(["Дата","Смена","ОКиУ","Рабочий стол","Кол-во","ФИО сотрудников"]);
  applyHeaderStyle(s8.lastRow!, "2E7D32");
  s8.views = [{ state: "frozen", ySplit: 1 }];

  let attendanceRows: (typeof attendanceLogsTable.$inferSelect)[] = [];
  try {
    const atConds: any[] = [];
    if (q.dateFrom) atConds.push(gte(attendanceLogsTable.createdAt, new Date(q.dateFrom)));
    if (q.dateTo) atConds.push(lte(attendanceLogsTable.createdAt, new Date(q.dateTo)));
    attendanceRows = atConds.length > 0
      ? await db.select().from(attendanceLogsTable).where(and(...atConds)).orderBy(desc(attendanceLogsTable.logDate))
      : await db.select().from(attendanceLogsTable).orderBy(desc(attendanceLogsTable.logDate));
  } catch (_) { /* table may not exist on older deploys */ }

  for (const al of attendanceRows) {
    const names = Array.isArray(al.peopleNames) ? (al.peopleNames as string[]).filter(Boolean).join(", ") : "";
    const row = s8.addRow([
      al.logDate, al.shiftName ?? "", al.zone ?? "",
      al.workplaceName ?? "", al.peopleCount, names,
    ]);
    applyDataRow(row);
    row.getCell(1).numFmt = "DD.MM.YYYY";
  }
  autoWidth(s8);

  // ── Generate filename and send ────────────────────────────────────
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const datePart = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`;
  const timePart = `${pad(now.getHours())}-${pad(now.getMinutes())}`;
  const filename = `Контроль_рабочих_столов_${datePart}_${timePart}.xlsx`;
  const encoded = encodeURIComponent(filename);

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encoded}`);

  await logSecurity(String(sv.supervisorId), sv.login, sv.role, "export_excel", "success", `Выгрузка Excel: ${filename}`, req);

  await wb.xlsx.write(res);
  res.end();
});

export default router;
