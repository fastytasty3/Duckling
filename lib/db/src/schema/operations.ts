import { pgTable, serial, text, integer, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const operationsTable = pgTable("operations", {
  id: serial("id").primaryKey(),
  productId: integer("product_id"),
  operatorId: integer("operator_id"),
  shiftId: integer("shift_id"),
  workplaceId: integer("workplace_id"),
  barcode: text("barcode").notNull(),
  productName: text("product_name"),
  productSku: text("product_sku"),
  productCategory: text("product_category"),
  operatorName: text("operator_name"),
  shiftName: text("shift_name"),
  workplaceName: text("workplace_name"),
  startTime: timestamp("start_time", { withTimezone: true }).notNull(),
  endTime: timestamp("end_time", { withTimezone: true }),
  status: text("status").notNull().default("active"), // active | paused | stopped | completed
  quantity: integer("quantity").notNull().default(1),
  netDurationSeconds: integer("net_duration_seconds"),
  totalDurationSeconds: integer("total_duration_seconds"),
  pauseDurationSeconds: integer("pause_duration_seconds").default(0),
  normTimeSeconds: integer("norm_time_seconds"),
  comment: text("comment"),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("operations_start_time_idx").on(t.startTime),
  index("operations_operator_idx").on(t.operatorId),
  index("operations_barcode_idx").on(t.barcode),
  index("operations_status_idx").on(t.status),
]);

export const insertOperationSchema = createInsertSchema(operationsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertOperation = z.infer<typeof insertOperationSchema>;
export type Operation = typeof operationsTable.$inferSelect;
