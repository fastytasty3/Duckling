import { useState } from "react";
import { authApi } from "@/lib/api";
import { Eye, EyeOff, Lock } from "lucide-react";

interface Props { onDone: () => void }

export default function ChangePassword({ onDone }: Props) {
  const [form, setForm] = useState({ currentPassword: "", newPassword: "", confirmNewPassword: "" });
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  const checks = [
    { label: "Минимум 8 символов", ok: form.newPassword.length >= 8 },
    { label: "Заглавная буква", ok: /[A-ZА-Я]/.test(form.newPassword) },
    { label: "Строчная буква", ok: /[a-zа-я]/.test(form.newPassword) },
    { label: "Цифра", ok: /[0-9]/.test(form.newPassword) },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); setSuccess("");
    if (checks.some(c => !c.ok)) { setError("Пароль не соответствует требованиям"); return; }
    if (form.newPassword !== form.confirmNewPassword) { setError("Пароли не совпадают"); return; }
    setLoading(true);
    try {
      const res = await authApi.changePassword(form);
      setSuccess(res.message);
      setTimeout(onDone, 2000);
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="max-w-md">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
        <div className="flex items-center gap-3 mb-6">
          <Lock className="w-5 h-5 text-amber-500" />
          <h2 className="text-white font-bold">Смена пароля</h2>
        </div>

        {success ? (
          <div className="bg-green-950/50 border border-green-800 text-green-400 text-sm rounded-lg p-4 text-center">
            {success}<br/><span className="text-green-600 text-xs">Перенаправление на страницу входа...</span>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <div className="bg-red-950/50 border border-red-800 text-red-400 text-sm rounded-lg p-3">{error}</div>}

            {[
              { key: "currentPassword", label: "Текущий пароль" },
              { key: "newPassword", label: "Новый пароль" },
              { key: "confirmNewPassword", label: "Подтверждение нового пароля" },
            ].map(f => (
              <div key={f.key}>
                <label className="text-zinc-400 text-xs">{f.label}</label>
                <div className="relative mt-1">
                  <input required type={show ? "text" : "password"}
                    value={(form as any)[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 pr-10 text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500"
                    placeholder="••••••••" autoComplete="new-password" />
                  {f.key === "currentPassword" && (
                    <button type="button" onClick={() => setShow(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500">
                      {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  )}
                </div>
                {f.key === "newPassword" && (
                  <div className="mt-2 space-y-1">
                    {checks.map(c => (
                      <div key={c.label} className={`text-xs flex items-center gap-1.5 ${c.ok ? "text-green-400" : "text-zinc-600"}`}>
                        <span>{c.ok ? "✓" : "○"}</span>{c.label}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}

            <button type="submit" disabled={loading}
              className="w-full bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-bold py-2.5 rounded-lg transition">
              {loading ? "Сохранение..." : "Сменить пароль"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
