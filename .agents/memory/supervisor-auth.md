---
name: Supervisor auth system & zone architecture
description: Auth, zone-based access control, operator session flow, and real-time workstation monitoring for the barcode scanner app.
---

## Auth
- bcrypt + JWT in httpOnly cookie (`sv_token`), sessions in `supervisor_sessions` table
- `validateSession` reads `account.department` and returns it as `AuthPayload.department`
- 5-attempt lockout, first-run admin wizard
- `ensureSchema()` on API startup creates missing tables/enums idempotently using `sql.raw()`

## Zone-based access (ОКиУ)
- `workplacesTable` has a `zone` column (text, nullable) — added via `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`
- `supervisorAccountsTable.department` stores the supervisor's zone (e.g., "ОКиУ 3")
- `/supervisor/workstations` filters by `sv.department` when `sv.role === "supervisor"`; admins see all
- Zone values for operators are fixed strings: "ОКиУ 2" through "ОКиУ 6"

**Why:** Zone isolation so supervisor of ОКиУ 3 only sees their workstations.

**How to apply:** When creating workplaces, set `zone = "ОКиУ X"`. When creating supervisor accounts, set `department = "ОКиУ X"` (must match exactly).

## Operator session flow (new)
- Session modal shows when `session?.workplaceId` is null (NOT operatorId)
- Operator selects ОКиУ (2–6) → workplace list filters by `wp.zone === selectedOkiu`
- `POST /session` accepts `{ workplaceId, zone }` — operatorId and shiftId are optional
- `DELETE /session` clears the in-memory session (operator logout)
- Session store (`session-store.ts`) has `clearSession()` function

## Home page tabs
- "Сканирование" — barcode scanning (existing)
- "Количество людей" — people counter (1–20) + FIO input per person, state is in-memory React state

## Workstation monitoring
- `/supervisor/workstations` is DB-driven (not WS-only); WS supplements if available
- WS URL fix: operators connect to `/api/ws` (not `/ws`)
- Operators send `state_update` via WS on every operation change + 15s ping

## Excel export
- 7-sheet export via `exceljs`
