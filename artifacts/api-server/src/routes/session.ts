import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, workplacesTable, attendanceLogsTable } from "@workspace/db";
import { SetSessionBody, SaveAttendanceBody } from "@workspace/api-zod";
import { getSession, setSession, clearSession } from "../lib/session-store";

const router: IRouter = Router();

const SHIFT_NAMES: Record<string, string> = {
  day: "Дневная (09:00–21:00)",
  night: "Ночная (21:00–09:00)",
};

/** Read the workplaceId for this request.
 *  Priority: X-Workplace-Id header → ?workplaceId query param → 0 (unknown)
 */
function getWorkplaceId(req: any): number {
  const header = req.headers["x-workplace-id"];
  if (header) return parseInt(String(header), 10) || 0;
  const query = req.query?.workplaceId;
  if (query) return parseInt(String(query), 10) || 0;
  return 0;
}

router.get("/session", async (req, res): Promise<void> => {
  const workplaceId = getWorkplaceId(req);
  if (!workplaceId) {
    // No workplaceId provided — return empty session so frontend shows modal
    res.json({ workplaceId: null, operatorId: null, shiftId: null, operatorName: null, shiftName: null, workplaceName: null, zone: null, shift: null });
    return;
  }
  res.json(getSession(workplaceId));
});

router.post("/session", async (req, res): Promise<void> => {
  const parsed = SetSessionBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { operatorId, shiftId, workplaceId, zone, shift } = parsed.data;

  if (!workplaceId) { res.status(400).json({ error: "workplaceId обязателен" }); return; }

  let workplaceName: string | null = null;
  const [wp] = await db.select().from(workplacesTable).where(eq(workplacesTable.id, workplaceId));
  if (wp) workplaceName = wp.name;

  const session = {
    operatorId: operatorId ?? null,
    shiftId: shiftId ?? null,
    workplaceId,
    operatorName: null,
    shiftName: shift ? (SHIFT_NAMES[shift] ?? null) : null,
    workplaceName,
    zone: zone ?? null,
    shift: (shift as "day" | "night" | undefined) ?? null,
  };
  setSession(workplaceId, session);
  res.json(session);
});

// Save attendance (people count + FIO list) for current shift
router.post("/session/attendance", async (req, res): Promise<void> => {
  const parsed = SaveAttendanceBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { peopleCount, peopleNames } = parsed.data;

  const workplaceId = getWorkplaceId(req);
  const session = workplaceId ? getSession(workplaceId) : null;
  if (!session?.workplaceId) { res.status(400).json({ error: "Сессия не активна" }); return; }

  const today = new Date().toISOString().slice(0, 10);

  const existing = await db.select({ id: attendanceLogsTable.id })
    .from(attendanceLogsTable)
    .where(
      and(
        eq(attendanceLogsTable.workplaceId, session.workplaceId),
        eq(attendanceLogsTable.logDate, today),
        ...(session.shiftName ? [eq(attendanceLogsTable.shiftName, session.shiftName)] : [])
      )
    )
    .limit(1);

  if (existing.length > 0) {
    await db.update(attendanceLogsTable).set({
      peopleCount,
      peopleNames,
      workplaceName: session.workplaceName,
      zone: session.zone,
    }).where(eq(attendanceLogsTable.id, existing[0].id));
  } else {
    await db.insert(attendanceLogsTable).values({
      workplaceId: session.workplaceId,
      workplaceName: session.workplaceName,
      zone: session.zone,
      shiftName: session.shiftName,
      logDate: today,
      peopleCount,
      peopleNames,
    });
  }

  res.json({ ok: true });
});

// Operator logout — clear this workplace's session
router.delete("/session", async (req, res): Promise<void> => {
  const workplaceId = getWorkplaceId(req);
  if (workplaceId) clearSession(workplaceId);
  res.json({ ok: true });
});

export default router;
