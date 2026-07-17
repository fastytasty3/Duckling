import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, shiftsTable } from "@workspace/db";
import {
  CreateShiftBody,
  UpdateShiftParams,
  UpdateShiftBody,
  DeleteShiftParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

const toDto = (r: typeof shiftsTable.$inferSelect) => ({
  id: r.id, name: r.name, timeStart: r.timeStart, timeEnd: r.timeEnd, active: r.active,
});

router.get("/shifts", async (_req, res): Promise<void> => {
  const rows = await db.select().from(shiftsTable);
  res.json(rows.map(toDto));
});

router.post("/shifts", async (req, res): Promise<void> => {
  const parsed = CreateShiftBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [row] = await db.insert(shiftsTable).values({
    name: parsed.data.name,
    timeStart: parsed.data.timeStart,
    timeEnd: parsed.data.timeEnd,
    active: parsed.data.active ?? true,
  }).returning();
  res.status(201).json(toDto(row));
});

router.patch("/shifts/:id", async (req, res): Promise<void> => {
  const params = UpdateShiftParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateShiftBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const updates: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.timeStart !== undefined) updates.timeStart = parsed.data.timeStart;
  if (parsed.data.timeEnd !== undefined) updates.timeEnd = parsed.data.timeEnd;
  if (parsed.data.active !== undefined) updates.active = parsed.data.active;
  const [row] = await db.update(shiftsTable).set(updates).where(eq(shiftsTable.id, params.data.id)).returning();
  if (!row) { res.status(404).json({ error: "Shift not found" }); return; }
  res.json(toDto(row));
});

router.delete("/shifts/:id", async (req, res): Promise<void> => {
  const params = DeleteShiftParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  await db.delete(shiftsTable).where(eq(shiftsTable.id, params.data.id));
  res.json({ ok: true });
});

export default router;
