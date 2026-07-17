import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/auth-context";
import { authApi } from "@/lib/api";
import { Eye, EyeOff, Lock, User, Shield, ScanBarcode } from "lucide-react";

type Mode = "choose" | "operator" | "supervisor";

function SetupWizard({ onDone }: { onDone: () => void }) {
  const [form, setForm] = useState({ fullName: "", login: "", password: "", confirmPassword: "", department: "" });
  const [error, setError] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);

  const checks = [
    { label: "Минимум 8 символов", ok: form.password.length >= 8 },
    { label: "Заглавная буква", ok: /[A-ZА-Я]/.test(form.password) },
    { label: "Строчная буква", ok: /[a-zа-я]/.test(form.password) },
    { label: "Цифра", ok: /[0-9]/.test(form.password) },
    { label: "Спецсимвол (желательно)", ok: /[^a-zA-ZА-Яа-я0-9]/.test(form.password) },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (checks.slice(0, 4).some(c => !c.ok)) { setError("Пароль не соответствует требованиям"); return; }
    setLoading(true);
    try {
      await authApi.setup(form);
      onDone();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-amber-600/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <Shield className="w-8 h-8 text-amber-500" />
          </div>
          <h1 className="text-2xl font-bold text-white">Первоначальная настройка</h1>
          <p className="text-zinc-400 mt-2 text-sm">Создайте учётную запись администратора для начала работы</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-4">
          {error && <div className="bg-red-950/50 border border-red-800 text-red-400 text-sm rounded-lg p-3">{error}</div>}

          <div>
            <label className="text-zinc-400 text-xs font-medium uppercase tracking-wider">ФИО *</label>
            <input required value={form.fullName} onChange={e => setForm(f => ({ ...f, fullName: e.target.value }))}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500"
              placeholder="Иванов Иван Иванович" />
          </div>
          <div>
            <label className="text-zinc-400 text-xs font-medium uppercase tracking-wider">Подразделение</label>
            <input value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500"
              placeholder="Отдел контроля" />
          </div>
          <div>
            <label className="text-zinc-400 text-xs font-medium uppercase tracking-wider">Логин *</label>
            <input required value={form.login} onChange={e => setForm(f => ({ ...f, login: e.target.value }))}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500"
              placeholder="Не используйте admin, 1234, password" autoComplete="username" />
          </div>
          <div>
            <label className="text-zinc-400 text-xs font-medium uppercase tracking-wider">Пароль *</label>
            <div className="relative mt-1">
              <input required type={show ? "text" : "password"} value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 pr-10 text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500"
                placeholder="Придумайте надёжный пароль" autoComplete="new-password" />
              <button type="button" onClick={() => setShow(s => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300">
                {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <div className="mt-2 space-y-1">
              {checks.map(c => (
                <div key={c.label} className={`text-xs flex items-center gap-1.5 ${c.ok ? "text-green-400" : "text-zinc-500"}`}>
                  <span>{c.ok ? "✓" : "○"}</span>{c.label}
                </div>
              ))}
            </div>
          </div>
          <div>
            <label className="text-zinc-400 text-xs font-medium uppercase tracking-wider">Подтверждение пароля *</label>
            <input required type={show ? "text" : "password"} value={form.confirmPassword}
              onChange={e => setForm(f => ({ ...f, confirmPassword: e.target.value }))}
              className={`mt-1 w-full bg-zinc-800 border rounded-lg px-3 py-2 text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500 ${form.confirmPassword && form.password !== form.confirmPassword ? "border-red-600" : "border-zinc-700"}`}
              placeholder="Повторите пароль" autoComplete="new-password" />
          </div>
          <button type="submit" disabled={loading}
            className="w-full bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-bold py-2.5 rounded-lg transition mt-2">
            {loading ? "Создание..." : "Создать учётную запись"}
          </button>
        </form>
      </div>
    </div>
  );
}

function SupervisorLoginForm() {
  const { login } = useAuth();
  const [, setLocation] = useLocation();
  const [form, setForm] = useState({ login: "", password: "", rememberMe: false });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [show, setShow] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(form.login, form.password, form.rememberMe);
      setLocation("/supervisor");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 w-full max-w-sm">
      <div className="text-center mb-6">
        <div className="w-12 h-12 bg-amber-600/20 rounded-full flex items-center justify-center mx-auto mb-3">
          <Lock className="w-6 h-6 text-amber-500" />
        </div>
        <h2 className="text-white font-bold text-lg">Контролирующее лицо</h2>
        <p className="text-zinc-500 text-sm mt-1">Введите логин и пароль</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <div className="bg-red-950/50 border border-red-800 text-red-400 text-sm rounded-lg p-3">{error}</div>}

        <div>
          <label className="text-zinc-400 text-xs font-medium">Логин</label>
          <div className="relative mt-1">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input required autoFocus value={form.login} onChange={e => setForm(f => ({ ...f, login: e.target.value }))}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg pl-9 pr-3 py-2 text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500"
              placeholder="Ваш логин" autoComplete="username" />
          </div>
        </div>

        <div>
          <label className="text-zinc-400 text-xs font-medium">Пароль</label>
          <div className="relative mt-1">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input required type={show ? "text" : "password"} value={form.password}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg pl-9 pr-10 py-2 text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500"
              placeholder="••••••••" autoComplete="current-password" />
            <button type="button" onClick={() => setShow(s => !s)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300">
              {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <input type="checkbox" id="rememberMe" checked={form.rememberMe}
            onChange={e => setForm(f => ({ ...f, rememberMe: e.target.checked }))}
            className="w-4 h-4 accent-amber-500" />
          <label htmlFor="rememberMe" className="text-zinc-400 text-sm">Запомнить вход (8 часов)</label>
        </div>

        <button type="submit" disabled={loading}
          className="w-full bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-bold py-2.5 rounded-lg transition">
          {loading ? "Вход..." : "Войти"}
        </button>

        <p className="text-center text-zinc-600 text-xs">
          При 5 неудачных попытках вход заблокируется на 5 минут
        </p>
      </form>
    </div>
  );
}

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>("choose");
  const [setupRequired, setSetupRequired] = useState<boolean | null>(null);
  const [setupDone, setSetupDone] = useState(false);
  const { supervisor } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (supervisor) { setLocation("/supervisor"); return; }
    authApi.setupRequired().then(r => setSetupRequired(r.required)).catch(() => setSetupRequired(false));
  }, [supervisor, setLocation]);

  if (setupRequired === null) return <div className="min-h-screen bg-zinc-950" />;

  if (setupRequired && !setupDone) {
    return <SetupWizard onDone={() => { setSetupRequired(false); setSetupDone(true); }} />;
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-white">Счётчик времени</h1>
          <p className="text-zinc-500 text-sm mt-1">Выберите режим входа</p>
        </div>

        {mode === "choose" && (
          <div className="space-y-3">
            <button onClick={() => setLocation("/")}
              className="w-full flex items-center gap-4 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 rounded-xl p-5 transition text-left">
              <div className="w-12 h-12 bg-blue-600/20 rounded-full flex items-center justify-center flex-shrink-0">
                <ScanBarcode className="w-6 h-6 text-blue-400" />
              </div>
              <div>
                <div className="text-white font-semibold">Войти как оператор</div>
                <div className="text-zinc-500 text-sm mt-0.5">Сканирование товаров, учёт времени</div>
              </div>
            </button>

            <button onClick={() => setMode("supervisor")}
              className="w-full flex items-center gap-4 bg-zinc-900 hover:bg-zinc-800 border border-amber-800/50 hover:border-amber-700 rounded-xl p-5 transition text-left">
              <div className="w-12 h-12 bg-amber-600/20 rounded-full flex items-center justify-center flex-shrink-0">
                <Shield className="w-6 h-6 text-amber-500" />
              </div>
              <div>
                <div className="text-white font-semibold">Контролирующее лицо</div>
                <div className="text-zinc-500 text-sm mt-0.5">Мониторинг, отчёты, управление</div>
              </div>
            </button>
          </div>
        )}

        {mode === "supervisor" && (
          <>
            <SupervisorLoginForm />
            <button onClick={() => setMode("choose")} className="w-full text-center text-zinc-600 hover:text-zinc-400 text-sm mt-4 transition">
              ← Назад
            </button>
          </>
        )}
      </div>
    </div>
  );
}
