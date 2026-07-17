import { useEffect, useState } from "react";
import { supervisorApi, type SecurityLogEntry } from "@/lib/api";
import { Shield, CheckCircle, XCircle } from "lucide-react";

const ACTION_LABELS: Record<string, string> = {
  login: "Вход", login_failed: "Неудачный вход", login_blocked: "Вход заблокирован",
  logout: "Выход", setup: "Начальная настройка", password_change: "Смена пароля",
  password_change_failed: "Неудачная смена пароля", password_reset: "Сброс пароля",
  account_blocked: "Блокировка аккаунта", account_unblocked: "Разблокировка",
  export_excel: "Экспорт Excel", edit_operation: "Редактирование операции",
  force_stop_operation: "Принудительное завершение",
};

export default function SupervisorSecurity() {
  const [rows, setRows] = useState<SecurityLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    supervisorApi.securityLog({ limit: 200 })
      .then(setRows)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-zinc-500 text-sm py-10 text-center">Загрузка...</div>;
  if (error) return <div className="bg-red-950/50 border border-red-800 text-red-400 text-sm rounded-lg p-3">{error}</div>;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
      <div className="p-3 border-b border-zinc-800 flex items-center gap-2">
        <Shield className="w-4 h-4 text-amber-500" />
        <span className="text-white font-medium text-sm">Журнал безопасности</span>
        <span className="text-zinc-500 text-xs ml-auto">Последние {rows.length} записей</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800">
              {["Дата/Время","Пользователь","Роль","IP","Действие","Результат","Описание"].map(h =>
                <th key={h} className="text-left text-zinc-500 font-medium px-3 py-2 text-xs">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} className={`border-b border-zinc-800/50 hover:bg-zinc-800/20 ${r.result === "failure" ? "bg-red-950/10" : ""}`}>
                <td className="px-3 py-2 text-zinc-400 text-xs whitespace-nowrap">
                  {new Date(r.timestamp).toLocaleString("ru-RU")}
                </td>
                <td className="px-3 py-2 text-zinc-200 text-xs">{r.userLogin ?? "—"}</td>
                <td className="px-3 py-2 text-zinc-500 text-xs">{r.userRole ?? "—"}</td>
                <td className="px-3 py-2 text-zinc-500 text-xs font-mono">{r.ipAddress ?? "—"}</td>
                <td className="px-3 py-2 text-zinc-200 text-xs">{ACTION_LABELS[r.action] ?? r.action}</td>
                <td className="px-3 py-2">
                  {r.result === "success"
                    ? <CheckCircle className="w-4 h-4 text-green-500" />
                    : <XCircle className="w-4 h-4 text-red-500" />}
                </td>
                <td className="px-3 py-2 text-zinc-400 text-xs max-w-[200px] truncate">{r.description ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
