import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { eq, and } from "drizzle-orm";
import { db, supervisorAccountsTable, supervisorSessionsTable, securityLogTable } from "@workspace/db";
import type { Request, Response, NextFunction } from "express";

const JWT_SECRET = process.env["SESSION_SECRET"] ?? "change-me-in-production";
const LOCKOUT_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 5 * 60 * 1000; // 5 minutes
const SESSION_DURATION_MS = 30 * 60 * 1000; // 30 minutes default

export interface AuthPayload {
  supervisorId: number;
  login: string;
  role: string;
  sessionToken: string;
}

export function getClientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) return String(forwarded).split(",")[0].trim();
  return req.socket?.remoteAddress ?? "unknown";
}

export async function logSecurity(
  userId: string | null,
  userLogin: string | null,
  userRole: string | null,
  action: string,
  result: "success" | "failure",
  description: string,
  req?: Request,
): Promise<void> {
  try {
    await db.insert(securityLogTable).values({
      userId,
      userLogin,
      userRole,
      computer: req?.headers["x-computer-name"] as string ?? null,
      workplaceId: req?.headers["x-workplace-id"] as string ?? null,
      workplaceName: req?.headers["x-workplace-name"] as string ?? null,
      ipAddress: req ? getClientIp(req) : null,
      action,
      result,
      description,
    });
  } catch { /* non-critical */ }
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function validatePasswordStrength(password: string): string | null {
  if (password.length < 8) return "Пароль должен содержать минимум 8 символов";
  if (!/[A-ZА-Я]/.test(password)) return "Пароль должен содержать минимум одну заглавную букву";
  if (!/[a-zа-я]/.test(password)) return "Пароль должен содержать минимум одну строчную букву";
  if (!/[0-9]/.test(password)) return "Пароль должен содержать минимум одну цифру";
  const FORBIDDEN = ["admin", "administrator", "password", "1234", "123456", "qwerty"];
  if (FORBIDDEN.some(f => password.toLowerCase().includes(f))) return "Пароль слишком простой";
  return null;
}

export async function isForbiddenLogin(login: string): Promise<boolean> {
  const FORBIDDEN = ["admin", "administrator", "root", "superuser", "supervisor", "user"];
  return FORBIDDEN.includes(login.toLowerCase());
}

export function generateSessionToken(supervisorId: number, login: string, role: string): string {
  return jwt.sign({ supervisorId, login, role, ts: Date.now() }, JWT_SECRET, { expiresIn: "8h" });
}

export async function createSession(supervisorId: number, login: string, role: string, req?: Request, rememberMe?: boolean): Promise<string> {
  const token = generateSessionToken(supervisorId, login, role);
  const durationMs = rememberMe ? 8 * 60 * 60 * 1000 : SESSION_DURATION_MS;
  await db.insert(supervisorSessionsTable).values({
    supervisorId,
    token,
    expiresAt: new Date(Date.now() + durationMs),
    ipAddress: req ? getClientIp(req) : null,
    userAgent: req?.headers["user-agent"] ?? null,
  });
  return token;
}

export async function invalidateSession(token: string): Promise<void> {
  await db.update(supervisorSessionsTable).set({ invalidated: true }).where(eq(supervisorSessionsTable.token, token));
}

export async function invalidateAllSessions(supervisorId: number): Promise<void> {
  await db.update(supervisorSessionsTable)
    .set({ invalidated: true })
    .where(eq(supervisorSessionsTable.supervisorId, supervisorId));
}

export async function validateSession(token: string): Promise<AuthPayload | null> {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as any;
    // Check DB session is valid and not expired
    const [session] = await db.select().from(supervisorSessionsTable)
      .where(eq(supervisorSessionsTable.token, token));
    if (!session || session.invalidated || session.expiresAt < new Date()) return null;
    // Check account still active
    const [account] = await db.select().from(supervisorAccountsTable)
      .where(eq(supervisorAccountsTable.id, payload.supervisorId));
    if (!account || !account.active || account.status === "admin_locked") return null;
    return { supervisorId: payload.supervisorId, login: payload.login, role: payload.role, sessionToken: token };
  } catch {
    return null;
  }
}

export function requireAuth(roles?: string[]) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const token = req.cookies?.["sv_token"] ?? req.headers["authorization"]?.replace("Bearer ", "");
    if (!token) {
      res.status(401).json({ error: "Требуется авторизация" });
      return;
    }
    const payload = await validateSession(token);
    if (!payload) {
      res.status(401).json({ error: "Сессия истекла или недействительна" });
      return;
    }
    if (roles && !roles.includes(payload.role)) {
      res.status(403).json({ error: "Доступ запрещен" });
      return;
    }
    (req as any).supervisor = payload;
    next();
  };
}
