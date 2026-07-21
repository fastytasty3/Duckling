import { Router, type IRouter } from "express";
import { and, desc, eq, gte, isNull, lte, inArray } from "drizzle-orm";
import { db, operationsTable, operationPausesTable, attendanceLogsTable } from "@workspace/db";
import { requireAuth, logSecurity } from "../lib/auth";
import ExcelJS from "exceljs";
import {
  buildSummarySheet,
  buildOperationsSheet,
  buildByOperatorSheet,
  buildByWorkplaceSheet,
  buildByBarcodeSheet,
  buildPausesSheet,
  buildProblematicSheet,
  buildAttendanceSheet,
} from "../lib/excel-builder";

const router: IRouter = Router();
const auth = requireAuth(["supervisor", "admin"]);

function buildConditions(q: Record<string, any>) {
  const conds: any[] = [isNull(operationsTable.deletedAt)];
  if (q.dateFrom)    conds.push(gte(operationsTable.startTime, new Date(q.dateFrom)));
  if (q.dateTo)      conds.push(lte(operationsTable.startTime, new Date(q.dateTo)));
  if (q.operatorId)  conds.push(eq(operationsTable.operatorId,  parseInt(q.operatorId,  10)));
  if (q.shiftId)     conds.push(eq(operationsTable.shiftId,     parseInt(q.shiftId,     10)));
  if (q.workplaceId) conds.push(eq(operationsTable.workplaceId, parseInt(q.workplaceId, 10)));
  if (q.barcode)     conds.push(eq(operationsTable.barcode, q.barcode));
  if (q.status)      conds.push(eq(operationsTable.status,  q.status));
  return conds;
}

router.get("/supervisor/export/excel", auth, async (req, res): Promise<void> => {
  const sv = (req as any).supervisor;
  const q = req.query as Record<string, any>;

  // Fetch data
  const rows = await db.select().from(operationsTable)
    .where(and(...buildConditions(q)))
    .orderBy(desc(operationsTable.startTime));

  const ids = rows.map(r => r.id);
  const pauses = ids.length > 0
    ? await db.select().from(operationPausesTable).where(inArray(operationPausesTable.operationId, ids))
    : [];

  let attendanceRows: (typeof attendanceLogsTable.$inferSelect)[] = [];
  try {
    const atConds: any[] = [];
    if (q.dateFrom) atConds.push(gte(attendanceLogsTable.createdAt, new Date(q.dateFrom)));
    if (q.dateTo)   atConds.push(lte(attendanceLogsTable.createdAt, new Date(q.dateTo)));
    attendanceRows = atConds.length > 0
      ? await db.select().from(attendanceLogsTable).where(and(...atConds)).orderBy(desc(attendanceLogsTable.logDate))
      : await db.select().from(attendanceLogsTable).orderBy(desc(attendanceLogsTable.logDate));
  } catch (_) { /* table may not exist on older deploys */ }

  // Build workbook
  const completed = rows.filter(r => r.status === "completed");
  const wb = new ExcelJS.Workbook();
  wb.creator = sv.login;
  wb.created = new Date();

  buildSummarySheet(wb, completed, q);
  buildOperationsSheet(wb, rows, completed);
  buildByOperatorSheet(wb, completed);
  buildByWorkplaceSheet(wb, completed);
  buildByBarcodeSheet(wb, completed);
  buildPausesSheet(wb, rows, pauses);
  buildProblematicSheet(wb, rows);
  buildAttendanceSheet(wb, attendanceRows);

  // Generate filename and send
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const filename = `Контроль_рабочих_столов_${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}.xlsx`;

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);

  await logSecurity(String(sv.supervisorId), sv.login, sv.role, "export_excel", "success", `Выгрузка Excel: ${filename}`, req);
  await wb.xlsx.write(res);
  res.end();
});

export default router;
