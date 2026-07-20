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

router.get("/session", async (_req, res): Promise<void> => {
  res.json(getSession());
});

router.post("/session", async (req, res): Promise<void> => {
  const parsed = SetSessionBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { operatorId, shiftId, workplaceId, zone, shift } = parsed.data;

  let workplaceName: string | null = null;
  if (workplaceId) {
    const [wp] = await db.select().from(workplacesTable).where(eq(workplacesTable.id, workplaceId));
    if (wp) workplaceName = wp.name;
  }

  const session = {
    operatorId: operatorId ?? null,
    shiftId: shiftId ?? null,
    workplaceId: workplaceId ?? null,
    operatorName: null,
    shiftName: shift ? (SHIFT_NAMES[shift] ?? null) : null,
    workplaceName,
    zone: zone ?? null,
    shift: (shift as "day" | "night" | undefined) ?? null,
  };
  setSession(session);
  res.json(session);
});

// Save attendance (people count + FIO list) for current shift
router.post("/session/attendance", async (req, res): Promise<void> => {
  const parsed = SaveAttendanceBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { peopleCount, peopleNames } = parsed.data;

  const session = getSession();
  if (!session.workplaceId) { res.status(400).json({ error: "Сессия не активна" }); return; }

  const today = new Date().toISOString().slice(0, 10);

  // Upsert: update existing record for this workplace+date+shift, or insert
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

// Operator logout — clear session
router.delete("/session", async (_req, res): Promise<void> => {
  clearSession();
  res.json({ ok: true });
});

export default router;
