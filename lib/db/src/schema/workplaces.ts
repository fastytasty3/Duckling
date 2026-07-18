import { pgTable, serial, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const workplacesTable = pgTable("workplaces", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  zone: text("zone"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertWorkplaceSchema = createInsertSchema(workplacesTable).omit({ id: true, createdAt: true });
export type InsertWorkplace = z.infer<typeof insertWorkplaceSchema>;
export type Workplace = typeof workplacesTable.$inferSelect;
