import { pgTable, serial, integer, text, timestamp, index } from "drizzle-orm/pg-core";

export const actionLogTable = pgTable("action_log", {
  id: serial("id").primaryKey(),
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
  userId: integer("user_id"),
  userName: text("user_name"),
  action: text("action").notNull(),
  details: text("details"),
}, (t) => [index("action_log_ts_idx").on(t.timestamp)]);

export type ActionLogEntry = typeof actionLogTable.$inferSelect;
