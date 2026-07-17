import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/auth-context";
import { supervisorApi, type WorkstationState, authApi } from "@/lib/api";
import { formatDuration } from "@/lib/date-utils";
import {
  Monitor, LogOut, Shield, BarChart2, History, Settings, AlertTriangle,
  RefreshCw, Download, Users, Clock, Package, Wifi, WifiOff, Lock
} from "lucide-react";
import SupervisorHistory from "./history";
import SupervisorReports from "./reports";
import SupervisorSecurity from "./security";
import SupervisorAccounts from "./accounts";
import ChangePassword from "./change-password";

type Tab = "workstations" | "history" | "reports" | "security" | "accounts" | "change-password";

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  unauthorized:  { label: "Не авторизован",        color: "text-zinc-400",   bg: "bg-zinc-800",    border: "border-zinc-700" },
  ready:         { label: "Готов к работе",         color: "text-green-400",  bg: "bg-green-950",   border: "border-green-800" },
  working:       { label: "Товар в работе",         color: "text-green-300",  bg: "bg-green-950",   border: "border-green-700" },
  paused:        { label: "Пауза",                  color: "text-yellow-400", bg: "bg-yellow-950",  border: "border-yellow-800" },
  idle:          { label: "Нет активности",         color: "text-yellow-400", bg: "bg-yellow-950",  border: "border-yellow-800" },
  overdue:       { label: "Слишком долгая операция",color: "text-red-400",    bg: "bg-red-950",     border: "border-red-800" },
  connection_error: { label: "Ошибка связи",       color: "text-red-400",    bg: "bg-red-950",     border: "border-red-800" },
  shift_ended:   { label: "Смена завершена",        color: "text-zinc-400",   bg: "bg-zinc-800",    border: "border-zinc-700" },
};

function WorkstationCard({ ws, token }: { ws: WorkstationState; token: string | null }) {
  const cfg = STATUS_CONFIG[ws.status] ?? STATUS_CONFIG.unauthorized;
  const elapsed = ws.operationStartTime
    ? Math.floor((Date.now() - new Date(ws.operationStartTime).getTime()) / 1000)
    : 0;

  const lastBeat = ws.lastHeartbeat ? new Date(ws.lastHeartbeat) : null;
  const isStale = lastBeat ? (Date.now() - lastBeat.getTime()) > 30000 : true;

  return (
    <div className={`rounded-xl border ${cfg.border} ${cfg.bg} p-4 flex flex-col gap-3 relative`}>
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Monitor className="w-4 h-4 text-zinc-400" />
            <span className="text-white font-semibold text-sm">{ws.workplaceName}</span>
            {isStale
              ? <WifiOff className="w-3 h-3 text-red-500 ml-1" title="Нет связи" />
              : <Wifi className="w-3 h-3 text-green-500 ml-1" title="Онлайн" />}
          </div>
          <div className={`text-xs font-medium mt-1 ${cfg.color}`}>{cfg.label}</div>
        </div>
        <div className="text-right text-xs text-zinc-500">
          {lastBeat ? lastBeat.toLocaleTimeString("ru-RU") : "—"}
        </div>
      </div>

      {/* Operator info */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <div className="text-zinc-500 uppercase tracking-wider text-[10px]">Оператор</div>
          <div className="text-zinc-200 font-medium truncate">{ws.operatorName ?? "—"}</div>
          {ws.operatorTabNumber && <div className="text-zinc-500">№{ws.operatorTabNumber}</div>}
        </div>
        <div>
          <div className="text-zinc-500 uppercase tracking-wider text-[10px]">Смена</div>
          <div className="text-zinc-200">{ws.shiftName ?? "—"}</div>
          {ws.loginTime && <div className="text-zinc-500">Вход: {new Date(ws.loginTime).toLocaleTimeString("ru-RU")}</div>}
        </div>
      </div>

      {/* Current operation */}
      {ws.currentProductName && (
        <div className="bg-black/30 rounded-lg p-3">
          <div className="text-zinc-500 text-[10px] uppercase tracking-wider mb-1">Текущий товар</div>
          <div className="text-white font-medium text-sm truncate">{ws.currentProductName}</div>
          {ws.currentSku && <div className="text-zinc-400 text-xs">{ws.currentSku}</div>}
          <div className="text-zinc-500 text-xs font-mono">{ws.currentBarcode}</div>
          <div className="flex items-center gap-3 mt-2">
            <div className="flex items-center gap-1 text-xs">
              <Clock className="w-3 h-3 text-amber-400" />
              <span className="text-amber-300 font-mono">{formatDuration(elapsed)}</span>
            </div>
            {ws.currentQuantity > 0 && (
              <div className="flex items-center gap-1 text-xs">
                <Package className="w-3 h-3 text-blue-400" />
                <span className="text-blue-300">{ws.currentQuantity} шт</span>
              </div>
            )}
            {ws.pauseDurationSeconds > 0 && (
              <div className="text-xs text-yellow-400">
                Пауза: {formatDuration(ws.pauseDurationSeconds)}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Shift stats */}
      <div className="flex items-center gap-4 text-xs text-zinc-400 border-t border-zinc-800 pt-2">
        <span>За смену: <b className="text-zinc-200">{ws.shiftOperationsTotal}</b> оп.</span>
        <span><b className="text-zinc-200">{ws.shiftUnitsTotal}</b> ед.</span>
        {ws.avgSecondsPerUnit > 0 && (
          <span>Ср: <b className="text-amber-300">{ws.avgSecondsPerUnit}с/ед</b></span>
        )}
        {ws.lastScanTime && (
          <span className="ml-auto text-zinc-600">
            {new Date(ws.lastScanTime).toLocaleTimeString("ru-RU")}
          </span>
        )}
      </div>
    </div>
  );
}

function WorkstationsTab({ token }: { token: string | null }) {
  const [workstations, setWorkstations] = useState<WorkstationState[]>([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  const connect = useCallback(() => {
    if (!token) return;
    const base = import.meta.env.BASE_URL.replace(/\/$/, "");
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${proto}//${location.host}${base}/ws?type=supervisor&token=${encodeURIComponent(token)}`;

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
    // Also fetch HTTP snapshot
    supervisorApi.workstations().then(setWorkstations).catch(() => {});
    connect();
    return () => wsRef.current?.close();
  }, [connect]);

  const sorted = [...workstations].sort((a, b) => a.workplaceId - b.workplaceId);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${connected ? "bg-green-500" : "bg-red-500"}`} />
          <span className="text-zinc-400 text-sm">{connected ? "Подключено (WebSocket)" : "Переподключение..."}</span>
        </div>
        <div className="text-zinc-500 text-sm">{sorted.length} рабочих столов</div>
      </div>

      {sorted.length === 0 ? (
        <div className="text-center py-16 text-zinc-600">
          <Monitor className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>Нет подключённых рабочих столов</p>
          <p className="text-sm mt-1">Рабочие станции отображаются здесь при подключении</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {sorted.map(ws => (
            <WorkstationCard key={ws.workplaceId} ws={ws} token={token} />
          ))}
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
    { id: "workstations",     label: "Рабочие столы",  icon: <Monitor className="w-4 h-4" /> },
    { id: "history",          label: "История",         icon: <History className="w-4 h-4" /> },
    { id: "reports",          label: "Отчёты",          icon: <BarChart2 className="w-4 h-4" /> },
    { id: "security",         label: "Журнал безопасности", icon: <Lock className="w-4 h-4" /> },
    { id: "accounts",         label: "Учётные записи",  icon: <Users className="w-4 h-4" />, adminOnly: true },
    { id: "change-password",  label: "Сменить пароль",  icon: <Settings className="w-4 h-4" /> },
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
          {tab === "change-password" && <ChangePassword onDone={() => setLocation("/supervisor/login")} />}
        </div>
      </main>
    </div>
  );
}
