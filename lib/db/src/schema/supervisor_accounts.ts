import { pgTable, serial, text, timestamp, integer, boolean, pgEnum } from "drizzle-orm/pg-core";

export const supervisorStatusEnum = pgEnum("supervisor_status", [
  "active",
  "temp_locked",
  "admin_locked",
  "must_change_password",
]);

export const supervisorRoleEnum = pgEnum("supervisor_role", [
  "supervisor",
  "admin",
]);

export const supervisorAccountsTable = pgTable("supervisor_accounts", {
  id: serial("id").primaryKey(),
  fullName: text("full_name").notNull(),
  login: text("login").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: supervisorRoleEnum("role").notNull().default("supervisor"),
  department: text("department"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  lastLoginAt: timestamp("last_login_at"),
  status: supervisorStatusEnum("status").notNull().default("active"),
  failedAttempts: integer("failed_attempts").notNull().default(0),
  lockedUntil: timestamp("locked_until"),
  mustChangePassword: boolean("must_change_password").notNull().default(false),
  active: boolean("active").notNull().default(true),
});
