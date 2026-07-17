import { actionLogTable } from "@workspace/db";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "@workspace/db";

export async function logAction(
  db: NodePgDatabase<typeof schema>,
  userId: number | null,
  userName: string | null,
  action: string,
  details?: string,
): Promise<void> {
  try {
    await db.insert(actionLogTable).values({
      userId,
      userName,
      action,
      details,
    });
  } catch {
    // Non-critical — do not throw
  }
}
