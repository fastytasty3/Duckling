/**
 * Management routes — access control tests.
 *
 * Verifies that write endpoints (operators, products, shifts, workplaces, settings)
 * are protected: unauthenticated requests return 401, wrong role returns 403,
 * and correct roles succeed.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import app from "../app";
import { db, supervisorAccountsTable, supervisorSessionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { hashPassword } from "../lib/auth";

// ── Helpers ──────────────────────────────────────────────────────────────────

async function createAccount(login: string, password: string, role: "admin" | "supervisor") {
  const passwordHash = await hashPassword(password);
  const [acc] = await db.insert(supervisorAccountsTable).values({
    fullName: "Test",
    login,
    passwordHash,
    role,
    status: "active",
    failedAttempts: 0,
    mustChangePassword: false,
  }).returning();
  return acc;
}

async function removeAccount(login: string) {
  const [acc] = await db
    .select({ id: supervisorAccountsTable.id })
    .from(supervisorAccountsTable)
    .where(eq(supervisorAccountsTable.login, login));
  if (!acc) return;
  await db.delete(supervisorSessionsTable).where(eq(supervisorSessionsTable.supervisorId, acc.id));
  await db.delete(supervisorAccountsTable).where(eq(supervisorAccountsTable.id, acc.id));
}

async function getToken(login: string, password: string): Promise<string> {
  const res = await request(app).post("/api/auth/login").send({ login, password });
  return res.body.token as string;
}

// ── Fixtures ─────────────────────────────────────────────────────────────────

const ADMIN = { login: "mgmt_test_admin", pass: "MgmtAdmin1!" };
const SUPERVISOR = { login: "mgmt_test_supervisor", pass: "MgmtSupervisor1!" };

let adminToken = "";
let supervisorToken = "";

beforeAll(async () => {
  await removeAccount(ADMIN.login);
  await removeAccount(SUPERVISOR.login);
  await createAccount(ADMIN.login, ADMIN.pass, "admin");
  await createAccount(SUPERVISOR.login, SUPERVISOR.pass, "supervisor");
  adminToken = await getToken(ADMIN.login, ADMIN.pass);
  supervisorToken = await getToken(SUPERVISOR.login, SUPERVISOR.pass);
});

afterAll(async () => {
  await removeAccount(ADMIN.login);
  await removeAccount(SUPERVISOR.login);
});

// ── Operators ─────────────────────────────────────────────────────────────────

describe("Operators — access control", () => {
  it("✅ GET /operators is open (no auth required)", async () => {
    const res = await request(app).get("/api/operators");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("❌ POST /operators without auth → 401", async () => {
    const res = await request(app).post("/api/operators").send({ name: "Hack" });
    expect(res.status).toBe(401);
  });

  it("✅ POST /operators with supervisor token → 201", async () => {
    const res = await request(app)
      .post("/api/operators")
      .set("Authorization", `Bearer ${supervisorToken}`)
      .send({ name: "Test Operator", tabNumber: "T-9999" });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeTruthy();

    // Clean up
    await request(app)
      .delete(`/api/operators/${res.body.id}`)
      .set("Authorization", `Bearer ${adminToken}`);
  });

  it("❌ DELETE /operators/:id with supervisor (not admin) → 403", async () => {
    // First create one to try to delete
    const create = await request(app)
      .post("/api/operators")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "To Delete", tabNumber: "T-8888" });
    expect(create.status).toBe(201);

    const res = await request(app)
      .delete(`/api/operators/${create.body.id}`)
      .set("Authorization", `Bearer ${supervisorToken}`);
    expect(res.status).toBe(403);

    // Clean up
    await request(app)
      .delete(`/api/operators/${create.body.id}`)
      .set("Authorization", `Bearer ${adminToken}`);
  });

  it("✅ DELETE /operators/:id with admin → 200", async () => {
    const create = await request(app)
      .post("/api/operators")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "To Delete Admin", tabNumber: "T-7777" });

    const res = await request(app)
      .delete(`/api/operators/${create.body.id}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});

// ── Shifts ────────────────────────────────────────────────────────────────────

describe("Shifts — access control", () => {
  it("✅ GET /shifts is open", async () => {
    const res = await request(app).get("/api/shifts");
    expect(res.status).toBe(200);
  });

  it("❌ POST /shifts without auth → 401", async () => {
    const res = await request(app).post("/api/shifts").send({ name: "Hack" });
    expect(res.status).toBe(401);
  });

  it("❌ PATCH /shifts/:id without auth → 401", async () => {
    const res = await request(app).patch("/api/shifts/1").send({ name: "Hack" });
    expect(res.status).toBe(401);
  });

  it("❌ DELETE /shifts/:id with supervisor (not admin) → 403", async () => {
    const create = await request(app)
      .post("/api/shifts")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Temp Shift", timeStart: "08:00", timeEnd: "16:00" });
    expect(create.status).toBe(201);

    const res = await request(app)
      .delete(`/api/shifts/${create.body.id}`)
      .set("Authorization", `Bearer ${supervisorToken}`);
    expect(res.status).toBe(403);

    // Clean up
    await request(app)
      .delete(`/api/shifts/${create.body.id}`)
      .set("Authorization", `Bearer ${adminToken}`);
  });
});

// ── Workplaces ────────────────────────────────────────────────────────────────

describe("Workplaces — access control", () => {
  it("✅ GET /workplaces is open", async () => {
    const res = await request(app).get("/api/workplaces");
    expect(res.status).toBe(200);
  });

  it("❌ POST /workplaces with supervisor (not admin) → 403", async () => {
    const res = await request(app)
      .post("/api/workplaces")
      .set("Authorization", `Bearer ${supervisorToken}`)
      .send({ name: "Hack WP" });
    expect(res.status).toBe(403);
  });

  it("✅ POST /workplaces with admin → 201", async () => {
    const res = await request(app)
      .post("/api/workplaces")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Test WP", zone: "A" });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeTruthy();

    // Clean up
    await request(app)
      .delete(`/api/workplaces/${res.body.id}`)
      .set("Authorization", `Bearer ${adminToken}`);
  });
});

// ── Products ──────────────────────────────────────────────────────────────────

describe("Products — access control", () => {
  it("✅ GET /products is open", async () => {
    const res = await request(app).get("/api/products");
    expect(res.status).toBe(200);
  });

  it("❌ POST /products without auth → 401", async () => {
    const res = await request(app)
      .post("/api/products")
      .send({ barcode: "9999999", name: "Hack", sku: "H1" });
    expect(res.status).toBe(401);
  });

  it("✅ POST /products with supervisor → 201", async () => {
    const barcode = `TEST-PROD-${Date.now()}`;
    const res = await request(app)
      .post("/api/products")
      .set("Authorization", `Bearer ${supervisorToken}`)
      .send({ barcode, name: "Test Product", sku: "TP-001" });
    expect(res.status).toBe(201);

    // Clean up
    await request(app)
      .delete(`/api/products/${res.body.id}`)
      .set("Authorization", `Bearer ${adminToken}`);
  });

  it("❌ DELETE /products/:id with supervisor → 403", async () => {
    const barcode = `TEST-DEL-${Date.now()}`;
    const create = await request(app)
      .post("/api/products")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ barcode, name: "Delete Me", sku: "D-001" });

    const res = await request(app)
      .delete(`/api/products/${create.body.id}`)
      .set("Authorization", `Bearer ${supervisorToken}`);
    expect(res.status).toBe(403);

    // Clean up
    await request(app)
      .delete(`/api/products/${create.body.id}`)
      .set("Authorization", `Bearer ${adminToken}`);
  });
});

// ── Settings ──────────────────────────────────────────────────────────────────

describe("Settings — access control", () => {
  it("✅ GET /settings is open", async () => {
    const res = await request(app).get("/api/settings");
    expect(res.status).toBe(200);
  });

  it("❌ PATCH /settings without auth → 401", async () => {
    const res = await request(app)
      .patch("/api/settings")
      .send({ scanMode: "increment_quantity" });
    expect(res.status).toBe(401);
  });

  it("❌ PATCH /settings with supervisor (not admin) → 403", async () => {
    const res = await request(app)
      .patch("/api/settings")
      .set("Authorization", `Bearer ${supervisorToken}`)
      .send({ scanMode: "increment_quantity" });
    expect(res.status).toBe(403);
  });

  it("✅ PATCH /settings with admin → 200", async () => {
    const res = await request(app)
      .patch("/api/settings")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ scanMode: "increment_quantity" });
    expect(res.status).toBe(200);
  });
});
