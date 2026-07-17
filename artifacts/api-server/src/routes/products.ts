import { Router, type IRouter } from "express";
import { eq, isNull, ilike, or } from "drizzle-orm";
import { db, productsTable } from "@workspace/db";
import {
  CreateProductBody,
  UpdateProductParams,
  UpdateProductBody,
  DeleteProductParams,
  GetProductByBarcodeParams,
  GetProductParams,
  ImportProductsBody,
  ListProductsQueryParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

const toDto = (r: typeof productsTable.$inferSelect) => ({
  id: r.id,
  barcode: r.barcode,
  sku: r.sku,
  name: r.name,
  category: r.category,
  unit: r.unit,
  normTimeSeconds: r.normTimeSeconds,
  comment: r.comment,
  active: r.active,
  createdAt: r.createdAt.toISOString(),
});

router.get("/products", async (req, res): Promise<void> => {
  const params = ListProductsQueryParams.safeParse(req.query);
  let rows = await db.select().from(productsTable).where(isNull(productsTable.deletedAt));
  if (params.success) {
    if (params.data.activeOnly) rows = rows.filter(r => r.active);
    if (params.data.search) {
      const s = params.data.search.toLowerCase();
      rows = rows.filter(r =>
        r.name.toLowerCase().includes(s) ||
        r.barcode.toLowerCase().includes(s) ||
        (r.sku?.toLowerCase() ?? "").includes(s)
      );
    }
    if (params.data.category) {
      rows = rows.filter(r => r.category === params.data.category);
    }
  }
  res.json(rows.map(toDto));
});

router.post("/products", async (req, res): Promise<void> => {
  const parsed = CreateProductBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  try {
    const [row] = await db.insert(productsTable).values({
      barcode: parsed.data.barcode,
      sku: parsed.data.sku,
      name: parsed.data.name,
      category: parsed.data.category,
      unit: parsed.data.unit,
      normTimeSeconds: parsed.data.normTimeSeconds,
      comment: parsed.data.comment,
      active: parsed.data.active ?? true,
    }).returning();
    res.status(201).json(toDto(row));
  } catch (e: any) {
    if (e?.code === "23505") {
      res.status(409).json({ error: "Товар с таким штрихкодом уже существует" });
    } else {
      throw e;
    }
  }
});

router.post("/products/import", async (req, res): Promise<void> => {
  const parsed = ImportProductsBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  let created = 0, updated = 0, skipped = 0;
  const errors: string[] = [];
  for (const row of parsed.data.rows) {
    try {
      const existing = await db.select().from(productsTable).where(eq(productsTable.barcode, row.barcode)).limit(1);
      if (existing.length > 0) {
        await db.update(productsTable).set({
          sku: row.sku ?? existing[0].sku,
          name: row.name,
          category: row.category ?? existing[0].category,
          normTimeSeconds: row.normTimeSeconds ?? existing[0].normTimeSeconds,
        }).where(eq(productsTable.barcode, row.barcode));
        updated++;
      } else {
        await db.insert(productsTable).values({
          barcode: row.barcode,
          sku: row.sku,
          name: row.name,
          category: row.category,
          normTimeSeconds: row.normTimeSeconds,
          active: true,
        });
        created++;
      }
    } catch (e: any) {
      errors.push(`${row.barcode}: ${e?.message ?? "Ошибка"}`);
      skipped++;
    }
  }
  res.json({ created, updated, skipped, errors });
});

router.get("/products/barcode/:barcode", async (req, res): Promise<void> => {
  const params = GetProductByBarcodeParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [row] = await db.select().from(productsTable)
    .where(eq(productsTable.barcode, params.data.barcode));
  if (!row) { res.status(404).json({ error: "Товар не найден" }); return; }
  res.json(toDto(row));
});

router.get("/products/:id", async (req, res): Promise<void> => {
  const params = GetProductParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [row] = await db.select().from(productsTable).where(eq(productsTable.id, params.data.id));
  if (!row) { res.status(404).json({ error: "Товар не найден" }); return; }
  res.json(toDto(row));
});

router.patch("/products/:id", async (req, res): Promise<void> => {
  const params = UpdateProductParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateProductBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const updates: Record<string, unknown> = {};
  const d = parsed.data;
  if (d.barcode !== undefined) updates.barcode = d.barcode;
  if (d.sku !== undefined) updates.sku = d.sku;
  if (d.name !== undefined) updates.name = d.name;
  if (d.category !== undefined) updates.category = d.category;
  if (d.unit !== undefined) updates.unit = d.unit;
  if (d.normTimeSeconds !== undefined) updates.normTimeSeconds = d.normTimeSeconds;
  if (d.comment !== undefined) updates.comment = d.comment;
  if (d.active !== undefined) updates.active = d.active;
  const [row] = await db.update(productsTable).set(updates).where(eq(productsTable.id, params.data.id)).returning();
  if (!row) { res.status(404).json({ error: "Товар не найден" }); return; }
  res.json(toDto(row));
});

router.delete("/products/:id", async (req, res): Promise<void> => {
  const params = DeleteProductParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  await db.update(productsTable).set({ deletedAt: new Date(), active: false }).where(eq(productsTable.id, params.data.id));
  res.json({ ok: true });
});

export default router;
