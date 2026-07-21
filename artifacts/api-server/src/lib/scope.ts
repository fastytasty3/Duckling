/**
 * Object-level access control helpers.
 *
 * Provides two kinds of checks:
 * 1. Workplace scope  — operator terminals send `X-Workplace-Id`; mutations on
 *    operations must belong to that workplace.
 * 2. Supervisor zone  — supervisors whose account has a `department` may only
 *    act on operations whose workplace zone matches that department.
 *    Admins bypass the zone check entirely.
 */

import { eq } from "drizzle-orm";
import { db, operationsTable, workplacesTable } from "@workspace/db";
import type { Request } from "express";
import type { AuthPayload } from "./auth";

/** Read workplace id from the X-Workplace-Id request header. */
export function getRequestWorkplaceId(req: Request): number | null {
  const header = req.headers["x-workplace-id"];
  if (!header) return null;
  const parsed = parseInt(String(header), 10);
  return isNaN(parsed) ? null : parsed;
}

/**
 * Verify an operation belongs to the given workplace.
 * Returns the operation row if allowed, null otherwise.
 */
export async function resolveOperationForWorkplace(
  operationId: number,
  workplaceId: number,
): Promise<{ workplaceId: number | null } | null> {
  const [op] = await db
    .select({ workplaceId: operationsTable.workplaceId })
    .from(operationsTable)
    .where(eq(operationsTable.id, operationId));

  if (!op) return null;
  if (op.workplaceId !== workplaceId) return null;
  return op;
}

/**
 * Verify a supervisor may act on an operation.
 *
 * - Admins: always allowed.
 * - Supervisors with no department: allowed (no zone restriction).
 * - Supervisors with a department: allowed only if the operation's
 *   workplace zone matches their department.
 */
export async function resolveOperationForSupervisor(
  operationId: number,
  sv: AuthPayload,
): Promise<boolean> {
  if (sv.role === "admin") return true;
  if (!sv.department) return true; // supervisor without zone restriction

  // Need to join workplace to get its zone
  const [op] = await db
    .select({ workplaceId: operationsTable.workplaceId })
    .from(operationsTable)
    .where(eq(operationsTable.id, operationId));

  if (!op || !op.workplaceId) return false;

  const [wp] = await db
    .select({ zone: workplacesTable.zone })
    .from(workplacesTable)
    .where(eq(workplacesTable.id, op.workplaceId));

  if (!wp) return false;
  return wp.zone === sv.department;
}
