import { pgTable, serial, integer, text, timestamp, boolean } from "drizzle-orm/pg-core";

export const supervisorSessionsTable = pgTable("supervisor_sessions", {
  id: serial("id").primaryKey(),
  supervisorId: integer("supervisor_id").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at").notNull(),
  invalidated: boolean("invalidated").notNull().default(false),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
});
