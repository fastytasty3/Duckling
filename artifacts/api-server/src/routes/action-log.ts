import { Router, type IRouter } from "express";
import { desc } from "drizzle-orm";
import { db, actionLogTable } from "@workspace/db";
import { ListActionLogQueryParams } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/action-log", async (req, res): Promise<void> => {
  const params = ListActionLogQueryParams.safeParse(req.query);
  const limit = (params.success && params.data.limit) ? params.data.limit : 100;
  const offset = (params.success && params.data.offset) ? params.data.offset : 0;
  const rows = await db.select().from(actionLogTable)
    .orderBy(desc(actionLogTable.timestamp))
    .limit(limit)
    .offset(offset);
  res.json(rows.map(r => ({
    id: r.id,
    timestamp: r.timestamp.toISOString(),
    userId: r.userId,
    userName: r.userName,
    action: r.action,
    details: r.details,
  })));
});

export default router;
