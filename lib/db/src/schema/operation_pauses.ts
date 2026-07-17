import { pgTable, serial, integer, timestamp, index } from "drizzle-orm/pg-core";

export const operationPausesTable = pgTable("operation_pauses", {
  id: serial("id").primaryKey(),
  operationId: integer("operation_id").notNull(),
  startTime: timestamp("start_time", { withTimezone: true }).notNull(),
  endTime: timestamp("end_time", { withTimezone: true }),
}, (t) => [index("pauses_operation_idx").on(t.operationId)]);

export type OperationPause = typeof operationPausesTable.$inferSelect;
