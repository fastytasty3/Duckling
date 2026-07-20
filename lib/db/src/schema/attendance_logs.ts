import { pgTable, serial, text, integer, timestamp, date } from "drizzle-orm/pg-core";
import { json } from "drizzle-orm/pg-core";

export const attendanceLogsTable = pgTable("attendance_logs", {
  id: serial("id").primaryKey(),
  workplaceId: integer("workplace_id"),
  workplaceName: text("workplace_name"),
  zone: text("zone"),
  shiftName: text("shift_name"),
  logDate: date("log_date").notNull(),
  peopleCount: integer("people_count").notNull().default(0),
  peopleNames: json("people_names").$type<string[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type AttendanceLog = typeof attendanceLogsTable.$inferSelect;
