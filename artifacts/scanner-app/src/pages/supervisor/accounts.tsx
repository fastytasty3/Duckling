import { useEffect, useState } from "react";
import { authApi, type SupervisorInfo } from "@/lib/api";
import { UserPlus, Lock, Unlock, RotateCcw, Eye, EyeOff } from "lucide-react";

export default function SupervisorAccounts() {
  const [accounts, setAccounts] = useState<SupervisorInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [resetId, setResetId] = useState<number | null>(null);
  const [resetPw, setResetPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [form, setForm] = useState({ fullName: "", login: "", password: "", role: "supervisor", department: "" });

  const load = () => {
    setLoading(true);
    authApi.accounts().then(setAccounts).catch(e => setError(e.message)).finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await authApi.createAccount(form);
      setShowCreate(false);
      setForm({ fullName: "", login: "", password: "", role: "supervisor", department: "" });
      load();
    } catch (err: any) { alert(err.message); }
  };

  const handleToggle = async (acc: SupervisorInfo) => {
    if (!confirm(`${acc.active ? "Заблокировать" : "Разблокировать"} учётную запись ${acc.login}?`)) return;
    try { await authApi.setStatus(acc.id, !acc.active); load(); }
    catch (e: any) { alert(e.message); }
  };

  const handleReset = async () => {
    if (!resetId) return;
    try { await authApi.resetPassword(resetId, resetPw); setResetId(null); setResetPw(""); alert("Временный пароль установлен. Пользователь обязан сменить его при следующем входе."); }
    catch (e: any) { alert(e.message); }
  };

  const STATUS_LABELS: Record<string, string> = {
    active: "Активен", temp_locked: "Врем. заблокирован",
    admin_locked: "Заблокирован", must_change_password: "Требует смены пароля",
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={() => setShowCreate(s => !s)}
          className="flex items-center gap-2 bg-amber-600 hover:bg-amber-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition">
          <UserPlus className="w-4 h-4" /> Создать учётную запись
        </button>
      </div>

      {showCreate && (
        <form onSubmit={handleCreate} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 grid grid-cols-2 gap-3">
          {[
            { label: "ФИО *", key: "fullName", placeholder: "Иванов Иван Иванович" },
            { label: "Подразделение", key: "department", placeholder: "Отдел контроля" },
            { label: "Логин *", key: "login", placeholder: "Уникальный логин" },
            { label: "Пароль *", key: "password", placeholder: "Минимум 8 символов" },
          ].map(f => (
            <div key={f.key}>
              <label className="text-zinc-400 text-xs">{f.label}</label>
              <input required={f.key !== "department"} type={f.key === "password" ? "password" : "text"}
                value={(form as any)[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500"
                placeholder={f.placeholder} />
            </div>
          ))}
          <div>
            <label className="text-zinc-400 text-xs">Роль</label>
            <select value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value }))}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500">
              <option value="supervisor">Контролирующее лицо</option>
              <option value="admin">Администратор</option>
            </select>
          </div>
          <div className="col-span-2 flex gap-3">
            <button type="submit" className="bg-amber-600 hover:bg-amber-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition">Создать</button>
            <button type="button" onClick={() => setShowCreate(false)} className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm px-4 py-2 rounded-lg transition">Отмена</button>
          </div>
        </form>
      )}

      {error && <div className="text-red-400 text-sm">{error}</div>}
      {loading ? <div className="text-zinc-500 text-sm text-center py-10">Загрузка...</div> : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-zinc-800">
              {["ФИО","Логин","Роль","Подразделение","Статус","Последний вход","Действия"].map(h =>
                <th key={h} className="text-left text-zinc-500 font-medium px-3 py-2 text-xs">{h}</th>)}
            </tr></thead>
            <tbody>
              {accounts.map(acc => (
                <tr key={acc.id} className={`border-b border-zinc-800/50 hover:bg-zinc-800/20 ${!acc.active ? "opacity-50" : ""}`}>
                  <td className="px-3 py-2 text-white text-xs font-medium">{acc.fullName}</td>
                  <td className="px-3 py-2 text-zinc-300 text-xs font-mono">{acc.login}</td>
                  <td className="px-3 py-2 text-xs"><span className={`px-2 py-0.5 rounded-full text-xs ${acc.role === "admin" ? "bg-amber-950 text-amber-400" : "bg-zinc-800 text-zinc-400"}`}>{acc.role === "admin" ? "Администратор" : "Контролёр"}</span></td>
                  <td className="px-3 py-2 text-zinc-400 text-xs">{acc.department ?? "—"}</td>
                  <td className="px-3 py-2 text-xs">
                    <span className={`px-2 py-0.5 rounded-full text-xs ${acc.status === "active" ? "bg-green-950 text-green-400" : acc.status === "temp_locked" ? "bg-yellow-950 text-yellow-400" : "bg-red-950 text-red-400"}`}>
                      {STATUS_LABELS[acc.status ?? "active"] ?? acc.status}
                    </span>
                    {acc.mustChangePassword && <span className="ml-1 text-amber-400 text-xs">• смена пароля</span>}
                  </td>
                  <td className="px-3 py-2 text-zinc-500 text-xs">{acc.lastLoginAt ? new Date(acc.lastLoginAt).toLocaleString("ru-RU") : "—"}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1">
                      <button onClick={() => handleToggle(acc)} className={`p-1 transition ${acc.active ? "text-zinc-500 hover:text-red-400" : "text-zinc-500 hover:text-green-400"}`} title={acc.active ? "Заблокировать" : "Разблокировать"}>
                        {acc.active ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
                      </button>
                      <button onClick={() => { setResetId(acc.id); setResetPw(""); }} className="p-1 text-zinc-500 hover:text-amber-400 transition" title="Сбросить пароль">
                        <RotateCcw className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Reset password modal */}
      {resetId && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-6 w-full max-w-sm">
            <h3 className="text-white font-bold mb-4">Сброс пароля</h3>
            <p className="text-zinc-400 text-sm mb-4">Введите временный пароль. При следующем входе пользователь обязан его сменить.</p>
            <div className="relative">
              <input type={showPw ? "text" : "password"} value={resetPw} onChange={e => setResetPw(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 pr-10 text-white text-sm focus:outline-none focus:border-amber-500"
                placeholder="Временный пароль (мин. 8 символов)" />
              <button type="button" onClick={() => setShowPw(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500">
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <div className="flex gap-3 mt-4">
              <button onClick={handleReset} className="flex-1 bg-amber-600 hover:bg-amber-500 text-white text-sm font-medium py-2 rounded-lg transition">Сбросить</button>
              <button onClick={() => setResetId(null)} className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm py-2 rounded-lg transition">Отмена</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
