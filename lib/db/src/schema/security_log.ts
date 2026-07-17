import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const securityLogTable = pgTable("security_log", {
  id: serial("id").primaryKey(),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
  userId: text("user_id"),
  userLogin: text("user_login"),
  userRole: text("user_role"),
  computer: text("computer"),
  workplaceId: text("workplace_id"),
  workplaceName: text("workplace_name"),
  ipAddress: text("ip_address"),
  action: text("action").notNull(),
  result: text("result").notNull(), // "success" | "failure"
  description: text("description"),
});
