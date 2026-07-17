import { createContext, useContext, useEffect, useRef, useState, useCallback, type ReactNode } from "react";
import { authApi, type SupervisorInfo } from "@/lib/api";
import { useLocation } from "wouter";

interface AuthContextValue {
  supervisor: SupervisorInfo | null;
  token: string | null;
  isLoading: boolean;
  login: (login: string, password: string, rememberMe?: boolean) => Promise<void>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const INACTIVITY_MS = 30 * 60 * 1000;    // 30 min
const WARNING_MS   =  2 * 60 * 1000;     // 2 min before logout

export function AuthProvider({ children }: { children: ReactNode }) {
  const [supervisor, setSupervisor] = useState<SupervisorInfo | null>(null);
  const [token, setToken] = useState<string | null>(() => sessionStorage.getItem("sv_token"));
  const [isLoading, setIsLoading] = useState(true);
  const [, setLocation] = useLocation();

  const inactivityTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warningTimer    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showWarning, setShowWarning] = useState(false);

  const doLogout = useCallback(async (silent = false) => {
    try { if (!silent) await authApi.logout(); } catch {}
    setSupervisor(null);
    setToken(null);
    sessionStorage.removeItem("sv_token");
    setLocation("/supervisor/login");
  }, [setLocation]);

  const resetInactivity = useCallback(() => {
    if (!supervisor) return;
    if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    if (warningTimer.current) clearTimeout(warningTimer.current);
    setShowWarning(false);
    warningTimer.current = setTimeout(() => setShowWarning(true), INACTIVITY_MS - WARNING_MS);
    inactivityTimer.current = setTimeout(() => doLogout(false), INACTIVITY_MS);
  }, [supervisor, doLogout]);

  // Attach activity listeners
  useEffect(() => {
    if (!supervisor) return;
    resetInactivity();
    const events = ["mousemove", "keydown", "click", "scroll", "touchstart"];
    events.forEach(e => window.addEventListener(e, resetInactivity, { passive: true }));
    return () => {
      events.forEach(e => window.removeEventListener(e, resetInactivity));
      if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
      if (warningTimer.current) clearTimeout(warningTimer.current);
    };
  }, [supervisor, resetInactivity]);

  // Restore session on mount
  useEffect(() => {
    const t = sessionStorage.getItem("sv_token");
    if (!t) { setIsLoading(false); return; }
    authApi.me()
      .then(me => { setSupervisor(me); setToken(t); })
      .catch(() => { sessionStorage.removeItem("sv_token"); })
      .finally(() => setIsLoading(false));
  }, []);

  const login = useCallback(async (login: string, password: string, rememberMe = false) => {
    const result = await authApi.login({ login, password, rememberMe });
    sessionStorage.setItem("sv_token", result.token);
    setToken(result.token);
    setSupervisor(result.supervisor);
  }, []);

  const logout = useCallback(() => doLogout(false), [doLogout]);

  const refreshMe = useCallback(async () => {
    const me = await authApi.me();
    setSupervisor(me);
  }, []);

  return (
    <AuthContext.Provider value={{ supervisor, token, isLoading, login, logout, refreshMe }}>
      {children}
      {/* Inactivity warning overlay */}
      {showWarning && supervisor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-zinc-900 border border-amber-500 rounded-xl p-8 max-w-sm mx-4 text-center shadow-2xl">
            <p className="text-amber-400 text-lg font-semibold mb-2">⚠ Сессия скоро завершится</p>
            <p className="text-zinc-300 text-sm mb-6">Из-за отсутствия активности сессия завершится через 2 минуты.</p>
            <button
              onClick={resetInactivity}
              className="w-full bg-amber-600 hover:bg-amber-500 text-white font-bold py-2 px-6 rounded-lg transition"
            >
              Продолжить работу
            </button>
          </div>
        </div>
      )}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
