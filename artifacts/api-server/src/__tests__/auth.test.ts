import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import app from "../app";
import { db, supervisorAccountsTable, supervisorSessionsTable, securityLogTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { hashPassword } from "../lib/auth";

// ── Helpers ────────────────────────────────────────────────────────────────────
async function createTestSupervisor(login: string, password: string, role: "admin" | "supervisor" = "admin") {
  const passwordHash = await hashPassword(password);
  const [acc] = await db.insert(supervisorAccountsTable).values({
    fullName: "Test User",
    login,
    passwordHash,
    role,
    status: "active",
    failedAttempts: 0,
    mustChangePassword: false,
  }).returning();
  return acc;
}

async function cleanupAccount(login: string) {
  const [acc] = await db.select({ id: supervisorAccountsTable.id }).from(supervisorAccountsTable).where(eq(supervisorAccountsTable.login, login));
  if (acc) {
    await db.delete(supervisorSessionsTable).where(eq(supervisorSessionsTable.supervisorId, acc.id));
    await db.delete(supervisorAccountsTable).where(eq(supervisorAccountsTable.id, acc.id));
  }
}

async function loginAs(login: string, password: string): Promise<string> {
  const res = await request(app).post("/api/auth/login").send({ login, password });
  expect(res.status).toBe(200);
  return res.body.token;
}

// ── Tests ─────────────────────────────────────────────────────────────────────
describe("Auth: supervisor login", () => {
  const LOGIN = "test_sv_login";
  const PASSWORD = "TestPass1!";

  beforeAll(async () => {
    await cleanupAccount(LOGIN);
    await createTestSupervisor(LOGIN, PASSWORD);
  });

  afterAll(async () => {
    await cleanupAccount(LOGIN);
  });

  it("✅ successful login returns token and supervisor info", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ login: LOGIN, password: PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.supervisor.login).toBe(LOGIN);
    expect(res.body.supervisor.role).toBe("admin");
    expect(res.body.supervisor.passwordHash).toBeUndefined(); // never returned
  });

  it("✅ /auth/me returns current user when authenticated", async () => {
    const token = await loginAs(LOGIN, PASSWORD);
    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.login).toBe(LOGIN);
  });

  it("❌ wrong password returns generic error (no hint about which field)", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ login: LOGIN, password: "WrongPass99!" });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Неверный логин или пароль");
    // Must NOT reveal that the login was correct
    expect(res.body.error).not.toContain("пароль неверный");
    expect(res.body.error).not.toContain("логин правильный");
  });

  it("❌ wrong login returns same generic error", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ login: "nonexistent_user_xyz", password: PASSWORD });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Неверный логин или пароль");
  });

  it("❌ missing fields returns 400", async () => {
    const res = await request(app).post("/api/auth/login").send({ login: LOGIN });
    expect(res.status).toBe(400);
  });
});

describe("Auth: lockout after 5 failed attempts", () => {
  const LOGIN = "test_sv_lockout";
  const PASSWORD = "LockoutTest1!";

  beforeAll(async () => {
    await cleanupAccount(LOGIN);
    await createTestSupervisor(LOGIN, PASSWORD);
  });

  afterAll(async () => {
    await cleanupAccount(LOGIN);
  });

  it("❌ after 5 wrong attempts, account gets locked", async () => {
    for (let i = 0; i < 4; i++) {
      const res = await request(app)
        .post("/api/auth/login")
        .send({ login: LOGIN, password: "WrongPass99!" });
      expect(res.status).toBe(401);
    }
    // 5th attempt — should trigger lockout
    const res5 = await request(app)
      .post("/api/auth/login")
      .send({ login: LOGIN, password: "WrongPass99!" });
    expect(res5.status).toBe(429);
    expect(res5.body.error).toContain("Слишком много неудачных попыток");

    // Subsequent attempt even with correct password should still be locked
    const correct = await request(app)
      .post("/api/auth/login")
      .send({ login: LOGIN, password: PASSWORD });
    expect(correct.status).toBe(429);
  });

  it("✅ lockout event is recorded in security log", async () => {
    const logs = await db.select().from(securityLogTable)
      .where(eq(securityLogTable.userLogin, LOGIN));
    const lockoutEvent = logs.find(l => l.action === "login_failed" || l.action === "login_blocked");
    expect(lockoutEvent).toBeTruthy();
  });
});

describe("Auth: access control — supervisor-only routes", () => {
  const ADMIN_LOGIN = "test_sv_admin_guard";
  const SUPERVISOR_LOGIN = "test_sv_plain_guard";
  const PASSWORD = "GuardTest1!";

  beforeAll(async () => {
    await cleanupAccount(ADMIN_LOGIN);
    await cleanupAccount(SUPERVISOR_LOGIN);
    await createTestSupervisor(ADMIN_LOGIN, PASSWORD, "admin");
    await createTestSupervisor(SUPERVISOR_LOGIN, PASSWORD, "supervisor");
  });

  afterAll(async () => {
    await cleanupAccount(ADMIN_LOGIN);
    await cleanupAccount(SUPERVISOR_LOGIN);
  });

  it("❌ unauthenticated request to protected route returns 401", async () => {
    const res = await request(app).get("/api/supervisor/workstations");
    expect(res.status).toBe(401);
    expect(res.body.error).toContain("Требуется авторизация");
  });

  it("❌ unauthenticated request to accounts route returns 401", async () => {
    const res = await request(app).get("/api/auth/accounts");
    expect(res.status).toBe(401);
  });

  it("❌ supervisor cannot access admin-only accounts route", async () => {
    const token = await loginAs(SUPERVISOR_LOGIN, PASSWORD);
    const res = await request(app)
      .get("/api/auth/accounts")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("Доступ запрещен");
  });

  it("✅ admin can access accounts list", async () => {
    const token = await loginAs(ADMIN_LOGIN, PASSWORD);
    const res = await request(app)
      .get("/api/auth/accounts")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("✅ supervisor can access workstations", async () => {
    const token = await loginAs(SUPERVISOR_LOGIN, PASSWORD);
    const res = await request(app)
      .get("/api/supervisor/workstations")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it("✅ supervisor can access security log", async () => {
    const token = await loginAs(SUPERVISOR_LOGIN, PASSWORD);
    const res = await request(app)
      .get("/api/supervisor/security-log")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe("Auth: expired / invalid session", () => {
  it("❌ invalid token returns 401", async () => {
    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", "Bearer invalid.jwt.token.here");
    expect(res.status).toBe(401);
  });

  it("❌ tampered token returns 401", async () => {
    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", "Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.tampered");
    expect(res.status).toBe(401);
  });
});

describe("Auth: Excel export — role enforcement", () => {
  const SUPERVISOR_LOGIN = "test_sv_excel";
  const PASSWORD = "ExcelTest1!";

  beforeAll(async () => {
    await cleanupAccount(SUPERVISOR_LOGIN);
    await createTestSupervisor(SUPERVISOR_LOGIN, PASSWORD, "supervisor");
  });

  afterAll(async () => {
    await cleanupAccount(SUPERVISOR_LOGIN);
  });

  it("❌ unauthenticated cannot export Excel", async () => {
    const res = await request(app).get("/api/supervisor/export/excel");
    expect(res.status).toBe(401);
  });

  it("✅ supervisor can download Excel report", async () => {
    const token = await loginAs(SUPERVISOR_LOGIN, PASSWORD);
    const res = await request(app)
      .get("/api/supervisor/export/excel")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("spreadsheetml");
    // Response should be a non-empty buffer
    expect(res.body).toBeTruthy();
  });
});

describe("Auth: setup wizard — first run", () => {
  const SETUP_LOGIN = "test_sv_setup_sentinel";
  const SETUP_PASS = "SetupSentinel1!";

  beforeAll(async () => {
    await cleanupAccount(SETUP_LOGIN);
    // Ensure at least one account exists so setup reports not-required
    await createTestSupervisor(SETUP_LOGIN, SETUP_PASS, "admin");
  });

  afterAll(async () => {
    await cleanupAccount(SETUP_LOGIN);
  });

  it("✅ /auth/setup-required returns { required: false } when accounts exist", async () => {
    const res = await request(app).get("/api/auth/setup-required");
    expect(res.status).toBe(200);
    expect(typeof res.body.required).toBe("boolean");
    // We just created an account so it must be false
    expect(res.body.required).toBe(false);
  });

  it("❌ second setup attempt returns 409 Conflict when accounts exist", async () => {
    const res = await request(app).post("/api/auth/setup").send({
      fullName: "Duplicate Admin",
      login: "duplicate_admin_xyz",
      password: "DupAdmin1!",
      confirmPassword: "DupAdmin1!",
    });
    expect(res.status).toBe(409);
  });
});
