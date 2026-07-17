import { Router, type IRouter } from "express";
import { eq, and, isNull } from "drizzle-orm";
import { db, operatorsTable } from "@workspace/db";
import {
  ListOperatorsQueryParams,
  CreateOperatorBody,
  UpdateOperatorParams,
  UpdateOperatorBody,
  DeleteOperatorParams,
} from "@workspace/api-zod";
import { logAction } from "../lib/action-logger";

const router: IRouter = Router();

router.get("/operators", async (req, res): Promise<void> => {
  const query = ListOperatorsQueryParams.safeParse(req.query);
  const rows = await db.select().from(operatorsTable);
  const filtered = query.success && query.data.activeOnly
    ? rows.filter(r => r.active)
    : rows;
  res.json(filtered.map(r => ({
    id: r.id,
    name: r.name,
    tabNumber: r.tabNumber,
    department: r.department,
    workplace: r.workplace,
    active: r.active,
    createdAt: r.createdAt.toISOString(),
  })));
});

router.post("/operators", async (req, res): Promise<void> => {
  const parsed = CreateOperatorBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db.insert(operatorsTable).values({
    name: parsed.data.name,
    tabNumber: parsed.data.tabNumber,
    department: parsed.data.department,
    workplace: parsed.data.workplace,
    active: parsed.data.active ?? true,
  }).returning();
  await logAction(db, null, null, "create_operator", `Создан оператор: ${row.name}`);
  res.status(201).json({ id: row.id, name: row.name, tabNumber: row.tabNumber, department: row.department, workplace: row.workplace, active: row.active, createdAt: row.createdAt.toISOString() });
});

router.get("/operators/:id", async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(rawId, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [row] = await db.select().from(operatorsTable).where(eq(operatorsTable.id, id));
  if (!row) { res.status(404).json({ error: "Operator not found" }); return; }
  res.json({ id: row.id, name: row.name, tabNumber: row.tabNumber, department: row.department, workplace: row.workplace, active: row.active, createdAt: row.createdAt.toISOString() });
});

router.patch("/operators/:id", async (req, res): Promise<void> => {
  const params = UpdateOperatorParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateOperatorBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const updates: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.tabNumber !== undefined) updates.tabNumber = parsed.data.tabNumber;
  if (parsed.data.department !== undefined) updates.department = parsed.data.department;
  if (parsed.data.workplace !== undefined) updates.workplace = parsed.data.workplace;
  if (parsed.data.active !== undefined) updates.active = parsed.data.active;
  const [row] = await db.update(operatorsTable).set(updates).where(eq(operatorsTable.id, params.data.id)).returning();
  if (!row) { res.status(404).json({ error: "Operator not found" }); return; }
  res.json({ id: row.id, name: row.name, tabNumber: row.tabNumber, department: row.department, workplace: row.workplace, active: row.active, createdAt: row.createdAt.toISOString() });
});

router.delete("/operators/:id", async (req, res): Promise<void> => {
  const params = DeleteOperatorParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  await db.update(operatorsTable).set({ active: false }).where(eq(operatorsTable.id, params.data.id));
  res.json({ ok: true });
});

export default router;
