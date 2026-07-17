import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, operatorsTable, shiftsTable, workplacesTable } from "@workspace/db";
import { SetSessionBody } from "@workspace/api-zod";
import { getSession, setSession } from "../lib/session-store";

const router: IRouter = Router();

router.get("/session", async (_req, res): Promise<void> => {
  res.json(getSession());
});

router.post("/session", async (req, res): Promise<void> => {
  const parsed = SetSessionBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { operatorId, shiftId, workplaceId } = parsed.data;
  let operatorName: string | null = null;
  let shiftName: string | null = null;
  let workplaceName: string | null = null;
  const [op] = await db.select().from(operatorsTable).where(eq(operatorsTable.id, operatorId));
  if (op) operatorName = op.name;
  const [sh] = await db.select().from(shiftsTable).where(eq(shiftsTable.id, shiftId));
  if (sh) shiftName = sh.name;
  if (workplaceId) {
    const [wp] = await db.select().from(workplacesTable).where(eq(workplacesTable.id, workplaceId));
    if (wp) workplaceName = wp.name;
  }
  const session = {
    operatorId,
    shiftId,
    workplaceId: workplaceId ?? null,
    operatorName,
    shiftName,
    workplaceName,
  };
  setSession(session);
  res.json(session);
});

export default router;
