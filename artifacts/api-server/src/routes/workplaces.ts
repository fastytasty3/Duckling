import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, workplacesTable } from "@workspace/db";
import {
  CreateWorkplaceBody,
  UpdateWorkplaceParams,
  UpdateWorkplaceBody,
  DeleteWorkplaceParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

const toDto = (r: typeof workplacesTable.$inferSelect) => ({
  id: r.id, name: r.name, zone: r.zone ?? null, active: r.active,
});

router.get("/workplaces", async (_req, res): Promise<void> => {
  const rows = await db.select().from(workplacesTable);
  res.json(rows.map(toDto));
});

router.post("/workplaces", async (req, res): Promise<void> => {
  const parsed = CreateWorkplaceBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [row] = await db.insert(workplacesTable).values({
    name: parsed.data.name,
    zone: (parsed.data as any).zone ?? null,
    active: parsed.data.active ?? true,
  }).returning();
  res.status(201).json(toDto(row));
});

router.patch("/workplaces/:id", async (req, res): Promise<void> => {
  const params = UpdateWorkplaceParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateWorkplaceBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const updates: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if ((parsed.data as any).zone !== undefined) updates.zone = (parsed.data as any).zone;
  if (parsed.data.active !== undefined) updates.active = parsed.data.active;
  const [row] = await db.update(workplacesTable).set(updates).where(eq(workplacesTable.id, params.data.id)).returning();
  if (!row) { res.status(404).json({ error: "Workplace not found" }); return; }
  res.json(toDto(row));
});

router.delete("/workplaces/:id", async (req, res): Promise<void> => {
  const params = DeleteWorkplaceParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  await db.delete(workplacesTable).where(eq(workplacesTable.id, params.data.id));
  res.json({ ok: true });
});

export default router;
