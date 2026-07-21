/**
 * IDOR (Insecure Direct Object Reference) tests.
 *
 * Verifies that:
 * 1. Operator terminals scoped to a workplace cannot manipulate operations
 *    belonging to a different workplace.
 * 2. An operation without a workplace can be accessed without scope restriction
 *    (backward-compat for legacy records).
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import app from "../app";
import { db, operationsTable, workplacesTable, supervisorAccountsTable, supervisorSessionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { hashPassword } from "../lib/auth";

// ── Helpers ───────────────────────────────────────────────────────────────────

async function createWorkplace(name: string, zone = "A") {
  const [wp] = await db.insert(workplacesTable).values({ name, zone, active: true }).returning();
  return wp;
}

async function createOperation(workplaceId: number | null) {
  const [op] = await db.insert(operationsTable).values({
    barcode: `IDOR-TEST-${Date.now()}-${Math.random()}`,
    workplaceId,
    status: "active",
    startTime: new Date(),
    quantity: 1,
    pauseDurationSeconds: 0,
  }).returning();
  return op;
}

async function removeWorkplace(id: number) {
  await db.delete(workplacesTable).where(eq(workplacesTable.id, id));
}

async function removeOperation(id: number) {
  await db.delete(operationsTable).where(eq(operationsTable.id, id));
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

let wp1: typeof workplacesTable.$inferSelect;
let wp2: typeof workplacesTable.$inferSelect;
let opAtWp1: typeof operationsTable.$inferSelect;
let opAtWp2: typeof operationsTable.$inferSelect;

beforeAll(async () => {
  wp1 = await createWorkplace("IDOR-WP-1", "Zone-A");
  wp2 = await createWorkplace("IDOR-WP-2", "Zone-B");
  opAtWp1 = await createOperation(wp1.id);
  opAtWp2 = await createOperation(wp2.id);
});

afterAll(async () => {
  await removeOperation(opAtWp1.id);
  await removeOperation(opAtWp2.id);
  await removeWorkplace(wp1.id);
  await removeWorkplace(wp2.id);
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("IDOR: GET /operations/:id — workplace scope", () => {
  it("✅ workplace 1 can read its own operation", async () => {
    const res = await request(app)
      .get(`/api/operations/${opAtWp1.id}`)
      .set("X-Workplace-Id", String(wp1.id));
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(opAtWp1.id);
  });

  it("❌ workplace 2 cannot read workplace 1's operation", async () => {
    const res = await request(app)
      .get(`/api/operations/${opAtWp1.id}`)
      .set("X-Workplace-Id", String(wp2.id));
    expect(res.status).toBe(403);
    expect(res.body.error).toContain("Доступ запрещён");
  });

  it("✅ no X-Workplace-Id header → no scope restriction (open read)", async () => {
    const res = await request(app).get(`/api/operations/${opAtWp1.id}`);
    expect(res.status).toBe(200);
  });
});

describe("IDOR: POST /operations/:id/stop — workplace scope", () => {
  it("❌ workplace 2 cannot stop workplace 1's operation", async () => {
    const res = await request(app)
      .post(`/api/operations/${opAtWp1.id}/stop`)
      .set("X-Workplace-Id", String(wp2.id));
    expect(res.status).toBe(403);
  });

  it("✅ workplace 1 can stop its own operation", async () => {
    // Create a fresh active op for this test
    const op = await createOperation(wp1.id);
    const res = await request(app)
      .post(`/api/operations/${op.id}/stop`)
      .set("X-Workplace-Id", String(wp1.id));
    expect(res.status).toBe(200);
    await removeOperation(op.id);
  });
});

describe("IDOR: POST /operations/:id/pause — workplace scope", () => {
  it("❌ workplace 2 cannot pause workplace 1's operation", async () => {
    const op = await createOperation(wp1.id);
    const res = await request(app)
      .post(`/api/operations/${op.id}/pause`)
      .set("X-Workplace-Id", String(wp2.id));
    expect(res.status).toBe(403);
    await removeOperation(op.id);
  });
});

describe("IDOR: PATCH /operations/:id/quantity — workplace scope", () => {
  it("❌ workplace 2 cannot change quantity on workplace 1's operation", async () => {
    const res = await request(app)
      .patch(`/api/operations/${opAtWp1.id}/quantity`)
      .set("X-Workplace-Id", String(wp2.id))
      .send({ delta: 1 });
    expect(res.status).toBe(403);
  });

  it("✅ workplace 1 can update its own operation's quantity", async () => {
    const op = await createOperation(wp1.id);
    const res = await request(app)
      .patch(`/api/operations/${op.id}/quantity`)
      .set("X-Workplace-Id", String(wp1.id))
      .send({ delta: 1 });
    expect(res.status).toBe(200);
    expect(res.body.quantity).toBe(2);
    await removeOperation(op.id);
  });
});

describe("IDOR: PATCH /operations/:id — requires auth", () => {
  it("❌ unauthenticated PATCH → 401", async () => {
    const res = await request(app)
      .patch(`/api/operations/${opAtWp1.id}`)
      .send({ quantity: 99 });
    expect(res.status).toBe(401);
  });
});

describe("IDOR: DELETE /operations/:id — requires admin", () => {
  it("❌ unauthenticated DELETE → 401", async () => {
    const res = await request(app).delete(`/api/operations/${opAtWp1.id}`);
    expect(res.status).toBe(401);
  });
});
