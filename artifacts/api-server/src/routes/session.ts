import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, workplacesTable } from "@workspace/db";
import { SetSessionBody } from "@workspace/api-zod";
import { getSession, setSession, clearSession } from "../lib/session-store";

const router: IRouter = Router();

router.get("/session", async (_req, res): Promise<void> => {
  res.json(getSession());
});

router.post("/session", async (req, res): Promise<void> => {
  const parsed = SetSessionBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { operatorId, shiftId, workplaceId, zone } = parsed.data;

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
    shiftName: null,
    workplaceName,
    zone: zone ?? null,
  };
  setSession(session);
  res.json(session);
});

// Operator logout — clear session
router.delete("/session", async (_req, res): Promise<void> => {
  clearSession();
  res.json({ ok: true });
});

export default router;
