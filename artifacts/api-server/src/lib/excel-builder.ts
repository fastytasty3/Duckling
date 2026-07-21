import ExcelJS from "exceljs";
import { operationsTable, operationPausesTable, attendanceLogsTable } from "@workspace/db";

type Operation = typeof operationsTable.$inferSelect;
type Pause = typeof operationPausesTable.$inferSelect;
type AttendanceLog = typeof attendanceLogsTable.$inferSelect;

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

export function secToExcelDuration(totalSeconds: number | null | undefined): number {
  if (!totalSeconds || totalSeconds <= 0) return 0;
  return totalSeconds / 86400; // Excel stores durations as fraction of a day
}

function applyHeaderStyle(row: ExcelJS.Row, fill = "1F3864"): void {
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

// ---------------------------------------------------------------------------
// Sheet 1 — Общая сводка
// ---------------------------------------------------------------------------

export function buildSummarySheet(wb: ExcelJS.Workbook, completed: Operation[], q: Record<string, any>): void {
  const s = wb.addWorksheet("Общая сводка");
  const uniqueOperators = new Set(completed.map(r => r.operatorId).filter(Boolean));
  const uniqueWorkplaces = new Set(completed.map(r => r.workplaceId).filter(Boolean));
  const totalNet = completed.reduce((acc, r) => acc + (r.netDurationSeconds ?? 0), 0);
  const totalPause = completed.reduce((acc, r) => acc + (r.pauseDurationSeconds ?? 0), 0);
  const totalUnits = completed.reduce((acc, r) => acc + r.quantity, 0);
  const withNorm = completed.filter(r => r.normTimeSeconds != null);
  const aboveNorm = withNorm.filter(r => (r.netDurationSeconds ?? 0) > r.normTimeSeconds!).length;
  const belowNorm = withNorm.filter(r => (r.netDurationSeconds ?? 0) <= r.normTimeSeconds!).length;
  const periodFrom = q.dateFrom ? new Date(q.dateFrom).toLocaleDateString("ru-RU") : "—";
  const periodTo   = q.dateTo   ? new Date(q.dateTo).toLocaleDateString("ru-RU")   : "—";

  s.addRow(["Параметр", "Значение"]);
  applyHeaderStyle(s.lastRow!, "B8860B");
  const rows: [string, any][] = [
    ["Период отчёта",                             `${periodFrom} — ${periodTo}`],
    ["Количество активных столов",                 uniqueWorkplaces.size],
    ["Количество операторов",                      uniqueOperators.size],
    ["Количество завершённых операций",            completed.length],
    ["Количество обработанных единиц",             totalUnits],
    ["Общее чистое время работы (чч:мм:сс)",      new Date(totalNet * 1000).toISOString().slice(11, 19)],
    ["Общее время пауз (чч:мм:сс)",               new Date(totalPause * 1000).toISOString().slice(11, 19)],
    ["Среднее время обработки единицы (сек)",     totalUnits > 0 ? Math.round(totalNet / totalUnits) : 0],
    ["Операций выше норматива",                    aboveNorm],
    ["Операций ниже/в норматив",                   belowNorm],
  ];
  for (const [k, v] of rows) applyDataRow(s.addRow([k, v]));
  autoWidth(s);
}

// ---------------------------------------------------------------------------
// Sheet 2 — Операции
// ---------------------------------------------------------------------------

export function buildOperationsSheet(wb: ExcelJS.Workbook, rows: Operation[], completed: Operation[]): void {
  const s = wb.addWorksheet("Операции");
  s.addRow(["Дата","Смена","Подразделение","Рабочий стол","ФИО оператора","Таб. №","Штрихкод","Артикул","Наименование товара","Категория","Начало","Окончание","Общая длительность","Длительность пауз","Чистое время","Кол-во","Ср. время/ед (сек)","Норматив (сек)","Откл. (сек)","Откл. (%)","Статус","Комм. оператора","Комм. контролёра"]);
  applyHeaderStyle(s.lastRow!);
  s.views = [{ state: "frozen", ySplit: 1 }];
  s.autoFilter = { from: "A1", to: "W1" };

  for (const op of rows) {
    const net = op.netDurationSeconds ?? 0;
    const norm = op.normTimeSeconds;
    const devSec = norm != null ? net - norm : null;
    const devPct = norm != null && norm > 0 ? (net - norm) / norm : null;
    const avgPerUnit = op.quantity > 0 && net > 0 ? Math.round(net / op.quantity) : null;
    const r = s.addRow([
      op.startTime, op.shiftName ?? "", op.operatorDepartment ?? "",
      op.workplaceName ?? "", op.operatorName ?? "", op.operatorTabNumber ?? "",
      op.barcode, op.productSku ?? "", op.productName ?? "", op.productCategory ?? "",
      op.startTime, op.endTime ?? null,
      secToExcelDuration(op.totalDurationSeconds), secToExcelDuration(op.pauseDurationSeconds),
      secToExcelDuration(net), op.quantity, avgPerUnit, norm, devSec,
      devPct != null ? devPct : null, op.status, op.comment ?? "", op.supervisorComment ?? "",
    ]);
    applyDataRow(r);
    r.getCell(1).numFmt = "DD.MM.YYYY";
    r.getCell(11).numFmt = "DD.MM.YYYY HH:MM:SS"; r.getCell(12).numFmt = "DD.MM.YYYY HH:MM:SS";
    r.getCell(13).numFmt = "[ч]:мм:сс"; r.getCell(14).numFmt = "[ч]:мм:сс"; r.getCell(15).numFmt = "[ч]:мм:сс";
    if (devPct != null) r.getCell(20).numFmt = "0.00%";
    if (devSec != null && devSec > 0) {
      r.getCell(19).font = { color: { argb: "FFCC0000" } };
      r.getCell(20).font = { color: { argb: "FFCC0000" } };
    }
  }

  const totRow = s.addRow(["ИТОГО","","","","","","","","","","","",
    secToExcelDuration(completed.reduce((acc,r)=>acc+(r.totalDurationSeconds??0),0)),
    secToExcelDuration(completed.reduce((acc,r)=>acc+(r.pauseDurationSeconds??0),0)),
    secToExcelDuration(completed.reduce((acc,r)=>acc+(r.netDurationSeconds??0),0)),
    completed.reduce((acc,r)=>acc+r.quantity,0),
  ]);
  totRow.font = { bold: true };
  totRow.getCell(13).numFmt = "[ч]:мм:сс"; totRow.getCell(14).numFmt = "[ч]:мм:сс"; totRow.getCell(15).numFmt = "[ч]:мм:сс";
  autoWidth(s);
}

// ---------------------------------------------------------------------------
// Sheet 3 — По операторам
// ---------------------------------------------------------------------------

export function buildByOperatorSheet(wb: ExcelJS.Workbook, completed: Operation[]): void {
  const s = wb.addWorksheet("По операторам");
  s.addRow(["ФИО","Таб. №","Кол-во смен","Кол-во операций","Кол-во единиц","Чистое время","Время пауз","Ср. время операции","Ср. время/ед","Выполнение норматива","Операций с превышением"]);
  applyHeaderStyle(s.lastRow!);
  s.views = [{ state: "frozen", ySplit: 1 }];

  const byOperator = new Map<string, Operation[]>();
  for (const op of completed) {
    const k = op.operatorName ?? "Неизвестный";
    if (!byOperator.has(k)) byOperator.set(k, []);
    byOperator.get(k)!.push(op);
  }

  for (const [name, ops] of byOperator) {
    const net = ops.reduce((acc, r) => acc + (r.netDurationSeconds ?? 0), 0);
    const pause = ops.reduce((acc, r) => acc + (r.pauseDurationSeconds ?? 0), 0);
    const units = ops.reduce((acc, r) => acc + r.quantity, 0);
    const withNorm = ops.filter(r => r.normTimeSeconds != null);
    const inNorm = withNorm.filter(r => (r.netDurationSeconds ?? 0) <= r.normTimeSeconds!).length;
    const normPct = withNorm.length > 0 ? inNorm / withNorm.length : null;
    const uniqueShifts = new Set(ops.map(r => `${r.shiftId}_${r.startTime.toDateString()}`)).size;
    const row = s.addRow([
      name, ops[0]?.operatorTabNumber ?? "", uniqueShifts, ops.length, units,
      secToExcelDuration(net), secToExcelDuration(pause),
      secToExcelDuration(ops.length > 0 ? Math.round(net / ops.length) : 0),
      secToExcelDuration(units > 0 ? Math.round(net / units) : 0),
      normPct, withNorm.filter(r => (r.netDurationSeconds ?? 0) > r.normTimeSeconds!).length,
    ]);
    applyDataRow(row);
    [6,7,8,9].forEach(c => { row.getCell(c).numFmt = "[ч]:мм:сс"; });
    if (normPct != null) row.getCell(10).numFmt = "0.0%";
  }
  autoWidth(s);
}

// ---------------------------------------------------------------------------
// Sheet 4 — По рабочим столам
// ---------------------------------------------------------------------------

export function buildByWorkplaceSheet(wb: ExcelJS.Workbook, completed: Operation[]): void {
  const s = wb.addWorksheet("По рабочим столам");
  s.addRow(["Рабочий стол","Подразделение","Операторов","Операций","Единиц","Суммарное время","Ср. время обработки","Первая операция","Последняя операция"]);
  applyHeaderStyle(s.lastRow!);
  s.views = [{ state: "frozen", ySplit: 1 }];

  const byWorkplace = new Map<string, Operation[]>();
  for (const op of completed) {
    const k = op.workplaceName ?? "Неизвестно";
    if (!byWorkplace.has(k)) byWorkplace.set(k, []);
    byWorkplace.get(k)!.push(op);
  }

  for (const [name, ops] of byWorkplace) {
    const net = ops.reduce((acc, r) => acc + (r.netDurationSeconds ?? 0), 0);
    const units = ops.reduce((acc, r) => acc + r.quantity, 0);
    const times = ops.map(r => r.startTime.getTime()).sort((a, b) => a - b);
    const row = s.addRow([
      name, "", new Set(ops.map(r => r.operatorId)).size, ops.length, units,
      secToExcelDuration(net),
      secToExcelDuration(ops.length > 0 ? Math.round(net / ops.length) : 0),
      times.length > 0 ? new Date(times[0]) : null,
      times.length > 0 ? new Date(times[times.length - 1]) : null,
    ]);
    applyDataRow(row);
    row.getCell(6).numFmt = "[ч]:мм:сс"; row.getCell(7).numFmt = "[ч]:мм:сс";
    row.getCell(8).numFmt = "DD.MM.YYYY HH:MM"; row.getCell(9).numFmt = "DD.MM.YYYY HH:MM";
  }
  autoWidth(s);
}

// ---------------------------------------------------------------------------
// Sheet 5 — По товарам
// ---------------------------------------------------------------------------

export function buildByBarcodeSheet(wb: ExcelJS.Workbook, completed: Operation[]): void {
  const s = wb.addWorksheet("По товарам");
  s.addRow(["Штрихкод","Артикул","Наименование","Категория","Операций","Единиц","Мин. время (сек)","Макс. время (сек)","Ср. время (сек)","Норматив (сек)","Ср. откл. (сек)","Операторов"]);
  applyHeaderStyle(s.lastRow!);
  s.views = [{ state: "frozen", ySplit: 1 }];

  const byBarcode = new Map<string, Operation[]>();
  for (const op of completed) {
    if (!byBarcode.has(op.barcode)) byBarcode.set(op.barcode, []);
    byBarcode.get(op.barcode)!.push(op);
  }

  for (const [barcode, ops] of byBarcode) {
    const nets = ops.map(r => r.netDurationSeconds ?? 0).filter(n => n > 0);
    const avg = nets.length > 0 ? Math.round(nets.reduce((a, n) => a + n, 0) / nets.length) : 0;
    const norm = ops[0]?.normTimeSeconds ?? null;
    const row = s.addRow([
      barcode, ops[0]?.productSku ?? "", ops[0]?.productName ?? barcode,
      ops[0]?.productCategory ?? "", ops.length,
      ops.reduce((acc, r) => acc + r.quantity, 0),
      nets.length > 0 ? Math.min(...nets) : null,
      nets.length > 0 ? Math.max(...nets) : null,
      avg, norm, norm != null ? avg - norm : null,
      new Set(ops.map(r => r.operatorId)).size,
    ]);
    applyDataRow(row);
    if (norm != null && avg > norm) row.getCell(11).font = { color: { argb: "FFCC0000" } };
  }
  autoWidth(s);
}

// ---------------------------------------------------------------------------
// Sheet 6 — Паузы и простои
// ---------------------------------------------------------------------------

export function buildPausesSheet(wb: ExcelJS.Workbook, rows: Operation[], pauses: Pause[]): void {
  const s = wb.addWorksheet("Паузы и простои");
  s.addRow(["Дата","Смена","Рабочий стол","Оператор","Начало паузы","Окончание паузы","Продолжительность","Комментарий"]);
  applyHeaderStyle(s.lastRow!);
  s.views = [{ state: "frozen", ySplit: 1 }];

  for (const p of pauses) {
    const op = rows.find(r => r.id === p.operationId);
    if (!op) continue;
    const durSec = p.endTime ? Math.round((p.endTime.getTime() - p.startTime.getTime()) / 1000) : null;
    const row = s.addRow([
      op.startTime, op.shiftName ?? "", op.workplaceName ?? "", op.operatorName ?? "",
      p.startTime, p.endTime ?? null,
      durSec != null ? secToExcelDuration(durSec) : null, "",
    ]);
    applyDataRow(row);
    row.getCell(1).numFmt = "DD.MM.YYYY";
    row.getCell(5).numFmt = "DD.MM.YYYY HH:MM:SS";
    row.getCell(6).numFmt = "DD.MM.YYYY HH:MM:SS";
    row.getCell(7).numFmt = "[ч]:мм:сс";
  }
  autoWidth(s);
}

// ---------------------------------------------------------------------------
// Sheet 7 — Проблемные операции
// ---------------------------------------------------------------------------

export function buildProblematicSheet(wb: ExcelJS.Workbook, rows: Operation[]): void {
  const s = wb.addWorksheet("Проблемные операции");
  s.addRow(["Дата","Оператор","Рабочий стол","Штрихкод","Товар","Начало","Статус","Причина","Комментарий контролёра"]);
  applyHeaderStyle(s.lastRow!, "8B0000");
  s.views = [{ state: "frozen", ySplit: 1 }];

  const problematic = rows.filter(r =>
    r.isFlagged || r.completedBySupervisor || r.timeManuallyEdited ||
    r.deletedAt != null || r.status === "active"
  );

  for (const op of problematic) {
    const reasons: string[] = [];
    if (op.isFlagged) reasons.push("Помечена контролёром");
    if (op.completedBySupervisor) reasons.push("Завершена контролёром");
    if (op.timeManuallyEdited) reasons.push("Время отредактировано вручную");
    if (op.deletedAt) reasons.push("Удалена");
    if (op.status === "active") reasons.push("Зависшая операция");
    if (op.flagReason) reasons.push(op.flagReason);
    const row = s.addRow([
      op.startTime, op.operatorName ?? "", op.workplaceName ?? "",
      op.barcode, op.productName ?? "", op.startTime, op.status,
      reasons.join("; "), op.supervisorComment ?? "",
    ]);
    applyDataRow(row);
    row.getCell(1).numFmt = "DD.MM.YYYY";
    row.getCell(6).numFmt = "DD.MM.YYYY HH:MM:SS";
    row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF0F0" } };
  }
  autoWidth(s);
}

// ---------------------------------------------------------------------------
// Sheet 8 — Явка сотрудников
// ---------------------------------------------------------------------------

export function buildAttendanceSheet(wb: ExcelJS.Workbook, attendanceRows: AttendanceLog[]): void {
  const s = wb.addWorksheet("Явка сотрудников");
  s.addRow(["Дата","Смена","ОКиУ","Рабочий стол","Кол-во","ФИО сотрудников"]);
  applyHeaderStyle(s.lastRow!, "2E7D32");
  s.views = [{ state: "frozen", ySplit: 1 }];

  for (const al of attendanceRows) {
    const names = Array.isArray(al.peopleNames)
      ? (al.peopleNames as string[]).filter(Boolean).join(", ")
      : "";
    const row = s.addRow([
      al.logDate, al.shiftName ?? "", al.zone ?? "",
      al.workplaceName ?? "", al.peopleCount, names,
    ]);
    applyDataRow(row);
    row.getCell(1).numFmt = "DD.MM.YYYY";
  }
  autoWidth(s);
}
