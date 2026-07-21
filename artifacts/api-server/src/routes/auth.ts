import { Router, type IRouter } from "express";
import { eq, and, gt } from "drizzle-orm";
import { db, supervisorAccountsTable, supervisorSessionsTable } from "@workspace/db";
import {
  hashPassword, verifyPassword, validatePasswordStrength, isForbiddenLogin,
  createSession, invalidateSession, invalidateAllSessions, validateSession,
  logSecurity, requireAuth,
} from "../lib/auth";

const router: IRouter = Router();

// Check if first-run setup needed
router.get("/auth/setup-required", async (_req, res): Promise<void> => {
  const [existing] = await db.select({ id: supervisorAccountsTable.id }).from(supervisorAccountsTable).limit(1);
  res.json({ required: !existing });
});

// First-run setup — create initial admin account
router.post("/auth/setup", async (req, res): Promise<void> => {
  const [existing] = await db.select({ id: supervisorAccountsTable.id }).from(supervisorAccountsTable).limit(1);
  if (existing) { res.status(409).json({ error: "Учётная запись уже создана" }); return; }

  const { fullName, login, password, confirmPassword, department } = req.body ?? {};
  if (!fullName || !login || !password || !confirmPassword) {
    res.status(400).json({ error: "Все поля обязательны" }); return;
  }
  if (password !== confirmPassword) {
    res.status(400).json({ error: "Пароли не совпадают" }); return;
  }
  const strengthErr = validatePasswordStrength(password);
  if (strengthErr) { res.status(400).json({ error: strengthErr }); return; }
  if (await isForbiddenLogin(login)) {
    res.status(400).json({ error: "Этот логин запрещён. Выберите другой" }); return;
  }

  const passwordHash = await hashPassword(password);
  const [account] = await db.insert(supervisorAccountsTable).values({
    fullName, login, passwordHash, role: "admin", department: department ?? null,
    status: "active", failedAttempts: 0, mustChangePassword: false,
  }).returning();

  await logSecurity(String(account.id), login, "admin", "setup", "success", "Первоначальная настройка: создана учётная запись администратора", req);
  res.status(201).json({ ok: true, id: account.id });
});

// Login
router.post("/auth/login", async (req, res): Promise<void> => {
  const { login, password, rememberMe } = req.body ?? {};
  if (!login || !password) { res.status(400).json({ error: "Укажите логин и пароль" }); return; }

  const [account] = await db.select().from(supervisorAccountsTable).where(eq(supervisorAccountsTable.login, login));

  // Generic error — don't reveal if login or password is wrong
  const genericError = { error: "Неверный логин или пароль" };

  if (!account) {
    await logSecurity(null, login, null, "login_failed", "failure", "Неверный логин", req);
    res.status(401).json(genericError); return;
  }

  if (!account.active || account.status === "admin_locked") {
    await logSecurity(String(account.id), login, account.role, "login_blocked", "failure", "Учётная запись заблокирована", req);
    res.status(403).json({ error: "Учётная запись заблокирована" }); return;
  }

  // Check lockout
  if (account.status === "temp_locked" && account.lockedUntil && account.lockedUntil > new Date()) {
    const remaining = Math.ceil((account.lockedUntil.getTime() - Date.now()) / 60000);
    res.status(429).json({ error: `Слишком много неудачных попыток. Повторите вход через ${remaining} мин.` }); return;
  }

  // Verify password
  const valid = await verifyPassword(password, account.passwordHash);
  if (!valid) {
    const newAttempts = account.failedAttempts + 1;
    const lockout = newAttempts >= 5;
    await db.update(supervisorAccountsTable).set({
      failedAttempts: newAttempts,
      status: lockout ? "temp_locked" : account.status === "temp_locked" ? "active" : account.status,
      lockedUntil: lockout ? new Date(Date.now() + 5 * 60 * 1000) : null,
    }).where(eq(supervisorAccountsTable.id, account.id));

    await logSecurity(String(account.id), login, account.role, "login_failed", "failure", `Неверный пароль (попытка ${newAttempts})`, req);

    if (lockout) {
      res.status(429).json({ error: "Слишком много неудачных попыток. Повторите вход позже." }); return;
    }
    res.status(401).json(genericError); return;
  }

  // Success — reset attempts, update last login
  await db.update(supervisorAccountsTable).set({
    failedAttempts: 0, lockedUntil: null,
    status: account.mustChangePassword ? "must_change_password" : "active",
    lastLoginAt: new Date(),
  }).where(eq(supervisorAccountsTable.id, account.id));

  const token = await createSession(account.id, account.login, account.role, req, !!rememberMe);

  // Set httpOnly cookie — Secure flag on in production
  const maxAge = rememberMe ? 8 * 60 * 60 * 1000 : 30 * 60 * 1000;
  const isSecure = process.env["NODE_ENV"] === "production";
  // nosemgrep: javascript.express.session-fixation.session-fixation
  // `token` is a server-generated JWT signed with SESSION_SECRET; `req` is
  // passed to createSession only for IP/user-agent audit logging, not to
  // construct the token value — no user-controlled data enters the cookie.
  res.cookie("sv_token", token, { httpOnly: true, sameSite: "strict", maxAge, secure: isSecure });

  await logSecurity(String(account.id), login, account.role, "login", "success", "Успешный вход", req);

  res.json({
    token,
    supervisor: {
      id: account.id, fullName: account.fullName, login: account.login,
      role: account.role, department: account.department,
      mustChangePassword: account.mustChangePassword,
    },
  });
});

// Me — get current user info
router.get("/auth/me", requireAuth(), async (req, res): Promise<void> => {
  const sv = (req as any).supervisor;
  const [account] = await db.select().from(supervisorAccountsTable).where(eq(supervisorAccountsTable.id, sv.supervisorId));
  if (!account) { res.status(404).json({ error: "Не найдено" }); return; }
  res.json({
    id: account.id, fullName: account.fullName, login: account.login,
    role: account.role, department: account.department,
    mustChangePassword: account.mustChangePassword,
    lastLoginAt: account.lastLoginAt?.toISOString() ?? null,
  });
});

// Logout
router.post("/auth/logout", requireAuth(), async (req, res): Promise<void> => {
  const sv = (req as any).supervisor;
  await invalidateSession(sv.sessionToken);
  res.clearCookie("sv_token");
  await logSecurity(String(sv.supervisorId), sv.login, sv.role, "logout", "success", "Выход из системы", req);
  res.json({ ok: true });
});

// Change password
router.post("/auth/change-password", requireAuth(), async (req, res): Promise<void> => {
  const sv = (req as any).supervisor;
  const { currentPassword, newPassword, confirmNewPassword } = req.body ?? {};
  if (!currentPassword || !newPassword || !confirmNewPassword) {
    res.status(400).json({ error: "Все поля обязательны" }); return;
  }
  if (newPassword !== confirmNewPassword) {
    res.status(400).json({ error: "Пароли не совпадают" }); return;
  }
  const strengthErr = validatePasswordStrength(newPassword);
  if (strengthErr) { res.status(400).json({ error: strengthErr }); return; }

  const [account] = await db.select().from(supervisorAccountsTable).where(eq(supervisorAccountsTable.id, sv.supervisorId));
  if (!account) { res.status(404).json({ error: "Не найдено" }); return; }

  const currentValid = await verifyPassword(currentPassword, account.passwordHash);
  if (!currentValid) {
    await logSecurity(String(account.id), account.login, account.role, "password_change_failed", "failure", "Неверный текущий пароль", req);
    res.status(401).json({ error: "Неверный текущий пароль" }); return;
  }

  const sameAsOld = await verifyPassword(newPassword, account.passwordHash);
  if (sameAsOld) { res.status(400).json({ error: "Новый пароль не должен совпадать с текущим" }); return; }

  const passwordHash = await hashPassword(newPassword);
  await db.update(supervisorAccountsTable).set({
    passwordHash, mustChangePassword: false, status: "active",
  }).where(eq(supervisorAccountsTable.id, account.id));

  // Invalidate all other sessions
  await invalidateAllSessions(account.id);

  await logSecurity(String(account.id), account.login, account.role, "password_change", "success", "Пароль изменён", req);
  res.clearCookie("sv_token");
  res.json({ ok: true, message: "Пароль успешно изменён. Войдите заново." });
});

// Supervisor accounts list (admin only)
router.get("/auth/accounts", requireAuth(["admin"]), async (_req, res): Promise<void> => {
  const rows = await db.select({
    id: supervisorAccountsTable.id,
    fullName: supervisorAccountsTable.fullName,
    login: supervisorAccountsTable.login,
    role: supervisorAccountsTable.role,
    department: supervisorAccountsTable.department,
    status: supervisorAccountsTable.status,
    createdAt: supervisorAccountsTable.createdAt,
    lastLoginAt: supervisorAccountsTable.lastLoginAt,
    active: supervisorAccountsTable.active,
    mustChangePassword: supervisorAccountsTable.mustChangePassword,
  }).from(supervisorAccountsTable);
  res.json(rows.map(r => ({ ...r, createdAt: r.createdAt.toISOString(), lastLoginAt: r.lastLoginAt?.toISOString() ?? null })));
});

// Create supervisor account (admin only)
router.post("/auth/accounts", requireAuth(["admin"]), async (req, res): Promise<void> => {
  const { fullName, login, password, role, department } = req.body ?? {};
  if (!fullName || !login || !password) { res.status(400).json({ error: "Все поля обязательны" }); return; }
  const strengthErr = validatePasswordStrength(password);
  if (strengthErr) { res.status(400).json({ error: strengthErr }); return; }
  if (await isForbiddenLogin(login)) { res.status(400).json({ error: "Этот логин запрещён" }); return; }
  const [existing] = await db.select({ id: supervisorAccountsTable.id }).from(supervisorAccountsTable).where(eq(supervisorAccountsTable.login, login));
  if (existing) { res.status(409).json({ error: "Логин уже занят" }); return; }
  const passwordHash = await hashPassword(password);
  const [account] = await db.insert(supervisorAccountsTable).values({
    fullName, login, passwordHash,
    role: (role === "admin" ? "admin" : "supervisor") as any,
    department: department ?? null, status: "active", mustChangePassword: true,
  }).returning({ id: supervisorAccountsTable.id, fullName: supervisorAccountsTable.fullName, login: supervisorAccountsTable.login });
  res.status(201).json(account);
});

// Reset password (admin only)
router.post("/auth/accounts/:id/reset-password", requireAuth(["admin"]), async (req, res): Promise<void> => {
  const sv = (req as any).supervisor;
  const id = parseInt(req.params.id, 10);
  const { temporaryPassword } = req.body ?? {};
  if (!temporaryPassword) { res.status(400).json({ error: "Укажите временный пароль" }); return; }
  const strengthErr = validatePasswordStrength(temporaryPassword);
  if (strengthErr) { res.status(400).json({ error: strengthErr }); return; }

  const passwordHash = await hashPassword(temporaryPassword);
  const [updated] = await db.update(supervisorAccountsTable).set({
    passwordHash, mustChangePassword: true, status: "must_change_password",
    failedAttempts: 0, lockedUntil: null,
  }).where(eq(supervisorAccountsTable.id, id)).returning({ login: supervisorAccountsTable.login });
  if (!updated) { res.status(404).json({ error: "Не найдено" }); return; }

  await invalidateAllSessions(id);
  await logSecurity(String(sv.supervisorId), sv.login, sv.role, "password_reset", "success", `Пароль сброшен для пользователя ${updated.login}`, req);
  res.json({ ok: true });
});

// Block/unblock account (admin only)
router.patch("/auth/accounts/:id/status", requireAuth(["admin"]), async (req, res): Promise<void> => {
  const sv = (req as any).supervisor;
  const id = parseInt(req.params.id, 10);
  if (id === sv.supervisorId) { res.status(400).json({ error: "Нельзя изменить собственный статус" }); return; }
  const { active } = req.body ?? {};
  const [updated] = await db.update(supervisorAccountsTable).set({
    active: !!active, status: active ? "active" : "admin_locked",
  }).where(eq(supervisorAccountsTable.id, id)).returning({ login: supervisorAccountsTable.login });
  if (!updated) { res.status(404).json({ error: "Не найдено" }); return; }
  if (!active) await invalidateAllSessions(id);
  await logSecurity(String(sv.supervisorId), sv.login, sv.role, active ? "account_unblocked" : "account_blocked", "success", `Учётная запись ${updated.login} ${active ? "разблокирована" : "заблокирована"}`, req);
  res.json({ ok: true });
});

export default router;
