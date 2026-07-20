import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/auth-context";
import { supervisorApi, type WorkstationState, authApi } from "@/lib/api";
import { formatDuration } from "@/lib/date-utils";
import {
  Monitor, LogOut, Shield, BarChart2, History, Settings, AlertTriangle,
  Users, Clock, Package, Wifi, WifiOff, Lock, LayoutGrid,
  ScanBarcode, Sun, Moon, UserCheck, XCircle, ChevronDown, ChevronUp
} from "lucide-react";
import SupervisorHistory from "./history";
import SupervisorReports from "./reports";
import SupervisorSecurity from "./security";
import SupervisorAccounts from "./accounts";
import SupervisorWorkplaces from "./workplaces";
import ChangePassword from "./change-password";

type Tab = "workstations" | "history" | "reports" | "security" | "accounts" | "workplaces" | "change-password";

const STATUS_CONFIG: Record<string, { label: string; dot: string; text: string }> = {
  unauthorized:     { label: "Не активен",              dot: "bg-zinc-600",   text: "text-zinc-500" },
  ready:            { label: "Готов к работе",           dot: "bg-green-500",  text: "text-green-400" },
  working:          { label: "Товар в работе",           dot: "bg-green-400 animate-pulse", text: "text-green-300" },
  paused:           { label: "Пауза",                   dot: "bg-yellow-400", text: "text-yellow-400" },
  idle:             { label: "Нет активности",          dot: "bg-yellow-500", text: "text-yellow-400" },
  overdue:          { label: "Слишком долгая операция", dot: "bg-red-500 animate-pulse", text: "text-red-400" },
  connection_error: { label: "Ошибка связи",            dot: "bg-red-500",    text: "text-red-400" },
  shift_ended:      { label: "Смена завершена",         dot: "bg-zinc-600",   text: "text-zinc-500" },
};

const isActive = (status: string) => ["ready", "working", "paused", "idle", "overdue"].includes(status);

function WorkstationRow({
  ws,
  onForceClose,
  closing,
  canClose,
}: {
  ws: WorkstationState;
  onForceClose: () => void;
  closing: boolean;
  canClose: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const cfg = STATUS_CONFIG[ws.status] ?? STATUS_CONFIG.unauthorized;
  const active = isActive(ws.status);

  const lastBeat = ws.lastHeartbeat ? new Date(ws.lastHeartbeat) : null;
  const isOnline = lastBeat ? (Date.now() - lastBeat.getTime()) < 30000 : false;
  const elapsed = ws.operationStartTime
    ? Math.floor((Date.now() - new Date(ws.operationStartTime).getTime()) / 1000)
    : 0;

  const hasPeople = ws.peopleNames && ws.peopleNames.filter(Boolean).length > 0;
  const shiftIcon = ws.shiftName?.toLowerCase().includes("ноч")
    ? <Moon className="w-3 h-3 text-indigo-400 shrink-0" />
    : ws.shiftName ? <Sun className="w-3 h-3 text-amber-400 shrink-0" /> : null;

  return (
    <div className={`transition-colors ${active ? "hover:bg-zinc-800/40" : "opacity-60"}`}>
      {/* Main row */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none"
        onClick={() => active && setExpanded(e => !e)}
      >
        {/* Status dot */}
        <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${cfg.dot}`} />

        {/* Workplace name */}
        <div className="w-36 shrink-0">
          <div className="flex items-center gap-1.5">
            <Monitor className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
            <span className={`text-sm font-semibold truncate ${active ? "text-white" : "text-zinc-500"}`}>
              {ws.workplaceName}
            </span>
          </div>
        </div>

        {/* Status label */}
        <div className={`w-44 shrink-0 text-xs font-medium ${cfg.text}`}>{cfg.label}</div>

        {/* Operator / people */}
        <div className="flex-1 min-w-0">
          {hasPeople ? (
            <div className="flex items-center gap-1.5">
              <UserCheck className="w-3.5 h-3.5 text-green-400 shrink-0" />
              <span className="text-xs text-zinc-300 truncate">
                {ws.peopleNames!.filter(Boolean).join(", ")}
              </span>
              {ws.peopleCount != null && ws.peopleCount > 0 && (
                <span className="text-[10px] text-green-400 font-bold shrink-0">{ws.peopleCount} чел.</span>
              )}
            </div>
          ) : ws.operatorName ? (
            <div className="flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
              <span className="text-xs text-zinc-300 truncate">{ws.operatorName}</span>
              {ws.operatorTabNumber && (
                <span className="text-[10px] text-zinc-500 shrink-0">№{ws.operatorTabNumber}</span>
              )}
            </div>
          ) : (
            <span className="text-xs text-zinc-600">—</span>
          )}
        </div>

        {/* Current barcode / product */}
        <div className="w-52 shrink-0 min-w-0">
          {ws.currentBarcode || ws.currentSku ? (
            <div className="flex items-center gap-1.5">
              <ScanBarcode className="w-3.5 h-3.5 text-blue-400 shrink-0" />
              <span className="text-xs text-zinc-300 truncate" title={ws.currentProductName ?? undefined}>
                {ws.currentProductName ?? ws.currentBarcode ?? ws.currentSku}
              </span>
            </div>
          ) : (
            <span className="text-xs text-zinc-600">—</span>
          )}
        </div>

        {/* Timer + qty */}
        <div className="w-28 shrink-0 flex items-center gap-2">
          {(ws.status === "working" || ws.status === "paused") && elapsed > 0 ? (
            <>
              <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="text-xs font-mono text-amber-300">{formatDuration(elapsed)}</span>
            </>
          ) : (
            <span className="text-xs text-zinc-600">—</span>
          )}
        </div>

        {/* Shift totals */}
        <div className="w-28 shrink-0 text-right">
          {ws.shiftOperationsTotal > 0 || ws.shiftUnitsTotal > 0 ? (
            <span className="text-xs text-zinc-400">
              <span className="text-zinc-200 font-semibold">{ws.shiftOperationsTotal}</span> оп. ·{" "}
              <span className="text-zinc-200 font-semibold">{ws.shiftUnitsTotal}</span> ед.
            </span>
          ) : (
            <span className="text-xs text-zinc-600">—</span>
          )}
        </div>

        {/* Actions */}
        <div className="w-28 shrink-0 flex items-center justify-end gap-2">
          {canClose && ws.activeOperationId && (
            <button
              onClick={e => { e.stopPropagation(); onForceClose(); }}
              disabled={closing}
              className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-red-950/60 text-red-400 border border-red-800/50 hover:bg-red-900/60 hover:text-red-300 disabled:opacity-40 transition"
            >
              <XCircle className="w-3.5 h-3.5" />
              {closing ? "..." : "Закрыть"}
            </button>
          )}
          {active && (
            <div className="text-zinc-600">
              {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </div>
          )}
        </div>
      </div>

      {/* Expanded details */}
      {expanded && active && (
        <div className="px-4 pb-4 pt-0 border-t border-zinc-800/60">
          <div className="ml-[calc(0.625rem+0.75rem)] flex flex-wrap gap-4 mt-3">

            {/* Shift & login time */}
            {(ws.shiftName || ws.loginTime) && (
              <div className="flex items-center gap-2 text-xs bg-zinc-900 rounded-lg px-3 py-2">
                {shiftIcon}
                <span className="text-zinc-300 font-medium">{ws.shiftName ?? "—"}</span>
                {ws.loginTime && (
                  <span className="text-zinc-500 ml-1">
                    с {new Date(ws.loginTime).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                )}
              </div>
            )}

            {/* Connectivity */}
            <div className="flex items-center gap-1.5 text-xs bg-zinc-900 rounded-lg px-3 py-2">
              {isOnline
                ? <Wifi className="w-3.5 h-3.5 text-green-500" />
                : <WifiOff className="w-3.5 h-3.5 text-red-500" />}
              <span className={isOnline ? "text-zinc-400" : "text-red-400"}>
                {isOnline ? "Онлайн" : "Нет связи"}
              </span>
              {lastBeat && (
                <span className="text-zinc-600 ml-1">{lastBeat.toLocaleTimeString("ru-RU")}</span>
              )}
            </div>

            {/* People list if long */}
            {hasPeople && ws.peopleNames!.filter(Boolean).length > 1 && (
              <div className="flex items-start gap-1.5 text-xs bg-zinc-900 rounded-lg px-3 py-2">
                <UserCheck className="w-3.5 h-3.5 text-green-400 mt-0.5 shrink-0" />
                <div className="space-y-0.5">
                  {ws.peopleNames!.filter(Boolean).map((name, i) => (
                    <div key={i} className="text-zinc-200">
                      <span className="text-zinc-500 font-mono">{i + 1}. </span>{name}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Barcode detail */}
            {(ws.currentBarcode || ws.currentSku) && (
              <div className="flex items-start gap-1.5 text-xs bg-zinc-900 rounded-lg px-3 py-2">
                <ScanBarcode className="w-3.5 h-3.5 text-blue-400 mt-0.5 shrink-0" />
                <div>
                  {ws.currentProductName && (
                    <div className="text-white font-medium mb-0.5">{ws.currentProductName}</div>
                  )}
                  <div className="flex items-center gap-3 flex-wrap">
                    {ws.currentSku && (
                      <span className="font-mono text-zinc-300 bg-zinc-800 rounded px-1.5 py-0.5">{ws.currentSku}</span>
                    )}
                    {ws.currentBarcode && (
                      <span className="font-mono text-zinc-500">{ws.currentBarcode}</span>
                    )}
                    {ws.currentQuantity > 0 && (
                      <span className="flex items-center gap-1 text-blue-300">
                        <Package className="w-3 h-3 text-blue-400" />{ws.currentQuantity} шт
                      </span>
                    )}
                    {ws.pauseDurationSeconds > 0 && (
                      <span className="text-yellow-400">Пауза: {formatDuration(ws.pauseDurationSeconds)}</span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Avg speed */}
            {ws.avgSecondsPerUnit > 0 && (
              <div className="flex items-center gap-1.5 text-xs bg-zinc-900 rounded-lg px-3 py-2">
                <Clock className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-zinc-400">Среднее: <span className="text-amber-300 font-mono">{ws.avgSecondsPerUnit}с/ед</span></span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function WorkstationsTab({ token }: { token: string | null }) {
  const { supervisor } = useAuth();
  const [workstations, setWorkstations] = useState<WorkstationState[]>([]);
  const [connected, setConnected] = useState(false);
  const [closing, setClosing] = useState<number | null>(null);
  const [closeError, setCloseError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const canClose = supervisor?.role === "admin" || supervisor?.role === "supervisor";

  const connect = useCallback(() => {
    if (!token) return;
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${proto}//${location.host}/api/ws?type=supervisor&token=${encodeURIComponent(token)}`;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => {
      setConnected(false);
      setTimeout(connect, 3000);
    };
    ws.onerror = () => ws.close();
    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        if (msg.type === "workstations_snapshot") setWorkstations(msg.data);
        else if (msg.type === "workstation_update") {
          setWorkstations(prev => {
            const idx = prev.findIndex(w => w.workplaceId === msg.data.workplaceId);
            if (idx >= 0) { const next = [...prev]; next[idx] = msg.data; return next; }
            return [...prev, msg.data];
          });
        }
      } catch {}
    };

    const ping = setInterval(() => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "ping" })); }, 15000);
    ws.addEventListener("close", () => clearInterval(ping));
  }, [token]);

  useEffect(() => {
    supervisorApi.workstations().then(setWorkstations).catch(() => {});
    connect();

    const poll = setInterval(() => {
      if (wsRef.current?.readyState !== WebSocket.OPEN) {
        supervisorApi.workstations().then(setWorkstations).catch(() => {});
      }
    }, 5000);

    return () => {
      clearInterval(poll);
      wsRef.current?.close();
    };
  }, [connect]);

  const handleForceClose = async (ws: WorkstationState) => {
    if (!ws.activeOperationId) return;
    if (!confirm(`Закрыть работу стола «${ws.workplaceName}»?\n\nТекущая операция будет принудительно завершена.`)) return;
    setClosing(ws.workplaceId);
    setCloseError(null);
    try {
      await supervisorApi.forceStop(ws.activeOperationId, "Закрыто администратором");
      const data = await supervisorApi.workstations();
      setWorkstations(data);
    } catch (e) {
      setCloseError((e as Error).message);
    } finally {
      setClosing(null);
    }
  };

  // Sort: by zone name, then by workplaceId within zone
  const sorted = [...workstations].sort((a, b) => {
    const za = a.zone ?? "Я"; // push null zones to end
    const zb = b.zone ?? "Я";
    if (za !== zb) return za.localeCompare(zb, "ru");
    return a.workplaceId - b.workplaceId;
  });

  // Group by zone
  const zones = [...new Set(sorted.map(ws => ws.zone ?? null))];

  const activeCount = sorted.filter(ws => isActive(ws.status)).length;

  return (
    <div>
      {/* Header bar */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className={`w-2 h-2 rounded-full ${connected ? "bg-green-500" : "bg-red-500"}`} />
          <span className="text-zinc-400 text-sm">{connected ? "Подключено" : "Переподключение..."}</span>
          <span className="text-zinc-600 text-sm">·</span>
          <span className="text-zinc-400 text-sm">
            <span className="text-white font-semibold">{activeCount}</span> активных из{" "}
            <span className="text-white font-semibold">{sorted.length}</span>
          </span>
        </div>
        {closeError && (
          <div className="text-xs text-red-400 bg-red-950/40 border border-red-800 rounded px-3 py-1.5">
            {closeError}
          </div>
        )}
      </div>

      {/* Column header */}
      {sorted.length > 0 && (
        <div className="flex items-center gap-3 px-4 pb-2 text-[10px] uppercase tracking-wider text-zinc-600 font-semibold select-none">
          <div className="w-2.5 shrink-0" />
          <div className="w-36 shrink-0">Стол</div>
          <div className="w-44 shrink-0">Статус</div>
          <div className="flex-1">Сотрудник</div>
          <div className="w-52 shrink-0">Товар</div>
          <div className="w-28 shrink-0">Время</div>
          <div className="w-28 shrink-0 text-right">За смену</div>
          <div className="w-28 shrink-0" />
        </div>
      )}

      {sorted.length === 0 ? (
        <div className="text-center py-16 text-zinc-600">
          <Monitor className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>Нет рабочих столов</p>
        </div>
      ) : (
        <div className="space-y-6">
          {zones.map(zone => {
            const rows = sorted.filter(ws => (ws.zone ?? null) === zone);
            const zoneActive = rows.filter(ws => isActive(ws.status)).length;
            return (
              <div key={zone ?? "__none__"}>
                {/* Zone header */}
                <div className="flex items-center gap-3 mb-1 px-1">
                  <span className="text-sm font-bold text-zinc-200">{zone ?? "Без ОКиУ"}</span>
                  <span className="text-xs text-zinc-500">
                    {zoneActive} / {rows.length} активных
                  </span>
                  <div className="flex-1 h-px bg-zinc-800" />
                </div>
                {/* Rows */}
                <div className="rounded-xl border border-zinc-800 overflow-hidden divide-y divide-zinc-800/80">
                  {rows.map(ws => (
                    <WorkstationRow
                      key={ws.workplaceId}
                      ws={ws}
                      onForceClose={() => handleForceClose(ws)}
                      closing={closing === ws.workplaceId}
                      canClose={canClose}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function SupervisorPanel() {
  const { supervisor, logout, token } = useAuth();
  const [, setLocation] = useLocation();
  const [tab, setTab] = useState<Tab>("workstations");

  useEffect(() => {
    if (!supervisor) setLocation("/supervisor/login");
  }, [supervisor, setLocation]);

  if (!supervisor) return null;

  const tabs: { id: Tab; label: string; icon: React.ReactNode; adminOnly?: boolean }[] = [
    { id: "workstations",     label: "Рабочие столы",      icon: <Monitor className="w-4 h-4" /> },
    { id: "history",          label: "История",             icon: <History className="w-4 h-4" /> },
    { id: "reports",          label: "Отчёты",              icon: <BarChart2 className="w-4 h-4" /> },
    { id: "security",         label: "Журнал безопасности", icon: <Lock className="w-4 h-4" /> },
    { id: "accounts",         label: "Учётные записи",      icon: <Users className="w-4 h-4" />, adminOnly: true },
    { id: "workplaces",       label: "Рабочие места",       icon: <LayoutGrid className="w-4 h-4" />, adminOnly: true },
    { id: "change-password",  label: "Сменить пароль",      icon: <Settings className="w-4 h-4" /> },
  ];

  const handleLogout = async () => {
    await logout();
    setLocation("/supervisor/login");
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex">
      {/* Sidebar */}
      <aside className="w-60 bg-zinc-900 border-r border-zinc-800 flex flex-col shrink-0">
        <div className="p-4 border-b border-zinc-800">
          <div className="flex items-center gap-2 mb-1">
            <Shield className="w-5 h-5 text-amber-500" />
            <span className="text-white font-bold text-sm">Контроль</span>
          </div>
          <div className="text-zinc-400 text-xs truncate">{supervisor.fullName}</div>
          <div className="text-zinc-600 text-xs">{supervisor.role === "admin" ? "Администратор" : "Контролирующее лицо"}</div>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {tabs.map(t => {
            if (t.adminOnly && supervisor.role !== "admin") return null;
            return (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition ${tab === t.id ? "bg-amber-600/20 text-amber-400 font-medium" : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"}`}>
                {t.icon}
                {t.label}
              </button>
            );
          })}
        </nav>

        <div className="p-3 border-t border-zinc-800">
          <button onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-red-400 hover:text-red-300 hover:bg-red-950/30 transition">
            <LogOut className="w-4 h-4" />
            Выйти
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <div className="p-6">
          <div className="mb-6">
            <h1 className="text-xl font-bold text-white">
              {tabs.find(t => t.id === tab)?.label ?? ""}
            </h1>
            {supervisor.mustChangePassword && (
              <div className="mt-2 bg-amber-950/50 border border-amber-700 rounded-lg p-3 text-amber-400 text-sm flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                Вам необходимо сменить пароль.
                <button onClick={() => setTab("change-password")} className="underline ml-1">Сменить сейчас</button>
              </div>
            )}
          </div>

          {tab === "workstations"    && <WorkstationsTab token={token} />}
          {tab === "history"         && <SupervisorHistory />}
          {tab === "reports"         && <SupervisorReports />}
          {tab === "security"        && <SupervisorSecurity />}
          {tab === "accounts"        && supervisor.role === "admin" && <SupervisorAccounts />}
          {tab === "workplaces"      && supervisor.role === "admin" && <SupervisorWorkplaces />}
          {tab === "change-password" && <ChangePassword onDone={() => setLocation("/supervisor/login")} />}
        </div>
      </main>
    </div>
  );
}
