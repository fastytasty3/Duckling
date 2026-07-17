---
name: Supervisor auth system
description: bcrypt+JWT supervisor auth, first-run wizard, lockout, Excel export, WebSocket monitoring
---

## What was built
- New DB tables: `supervisor_accounts`, `security_log`, `supervisor_sessions`
- Auth routes at `/api/auth/*`: login, logout, me, setup, change-password, reset-password, accounts CRUD
- Supervisor routes at `/api/supervisor/*`: workstations, history, flagged, security-log, force-stop, comment
- Excel export at `/api/supervisor/export/excel` (7 sheets, ExcelJS)
- WebSocket server at `/ws?type=supervisor&token=...` for real-time workstation status
- Frontend: login page at `/supervisor/login`, supervisor panel at `/supervisor`, auth context

## Key decisions
- JWT stored in httpOnly cookie AND returned as body.token (for WS use)
- SessionStorage used on frontend (not localStorage) for session token — cleared on tab close unless rememberMe
- Lockout: 5 failed attempts → `temp_locked` + `lockedUntil` timestamp in DB; 5-minute lockout
- Generic error message: always "Неверный логин или пароль" — never reveals which field is wrong
- WebSocket path `/ws` is attached to the same HTTP server as Express
- Workstation state is in-memory Map on server — refreshed by ws messages from operator tabs
- Excel: ExcelJS library, 7 sheets, frozen headers, auto-filter, duration format `[ч]:мм:сс`

**Why:**
- Security: no info leakage on login failure, bcrypt(12), httpOnly cookie
- Real-time: WebSocket preferred over polling for workstation status
- Passwords never logged (security log explicitly excludes them)
