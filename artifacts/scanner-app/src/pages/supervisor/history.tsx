import { useState } from "react";
import { supervisorApi } from "@/lib/api";
import { formatDuration } from "@/lib/date-utils";
import { Download, Flag, MessageSquare, Square } from "lucide-react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";

function formatSec(s: number | null | undefined) {
  if (!s) return "—";
  return formatDuration(s);
}

export default function SupervisorHistory() {
  const today = new Date().toISOString().slice(0, 10);
  const [filters, setFilters] = useState({ dateFrom: today, dateTo: today, status: "", limit: "100", offset: "0" });
  const [data, setData] = useState<{ items: any[]; total: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [commentOp, setCommentOp] = useState<{ id: number; comment: string; flag: boolean; flagReason: string } | null>(null);

  const load = async () => {
    setLoading(true); setError("");
    try {
      const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v));
      const res = await supervisorApi.history(params);
      setData(res);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  const handleForceStop = async (id: number) => {
    if (!confirm("Принудительно завершить операцию?")) return;
    try { await supervisorApi.forceStop(id, "Завершено контролирующим лицом"); await load(); }
    catch (e: any) { alert(e.message); }
  };

  const handleSaveComment = async () => {
    if (!commentOp) return;
    try {
      await supervisorApi.addComment(commentOp.id, { comment: commentOp.comment, flag: commentOp.flag, flagReason: commentOp.flagReason });
      setCommentOp(null);
      await load();
    } catch (e: any) { alert(e.message); }
  };

  const getExcelUrl = () => {
    const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v));
    return supervisorApi.exportExcel(params);
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="text-zinc-400 text-xs">Дата с</label>
            <input type="date" value={filters.dateFrom} onChange={e => setFilters(f => ({ ...f, dateFrom: e.target.value }))}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500" />
          </div>
          <div>
            <label className="text-zinc-400 text-xs">Дата по</label>
            <input type="date" value={filters.dateTo} onChange={e => setFilters(f => ({ ...f, dateTo: e.target.value }))}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500" />
          </div>
          <div>
            <label className="text-zinc-400 text-xs">Статус</label>
            <select value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500">
              <option value="">Все</option>
              <option value="completed">Завершены</option>
              <option value="active">Активные</option>
              <option value="paused">На паузе</option>
            </select>
          </div>
          <div className="flex items-end gap-2">
            <button onClick={load} disabled={loading}
              className="flex-1 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-sm font-medium py-2 px-4 rounded-lg transition">
              {loading ? "Загрузка..." : "Показать"}
            </button>
            <a href={getExcelUrl()} download target="_blank"
              className="bg-green-700 hover:bg-green-600 text-white text-sm font-medium py-2 px-3 rounded-lg transition flex items-center gap-1">
              <Download className="w-4 h-4" />
            </a>
          </div>
        </div>
        {/* Quick periods */}
        <div className="flex gap-2 mt-3 flex-wrap">
          {[
            { label: "Сегодня", from: today, to: today },
            { label: "Вчера", from: new Date(Date.now()-86400000).toISOString().slice(0,10), to: new Date(Date.now()-86400000).toISOString().slice(0,10) },
            { label: "7 дней", from: new Date(Date.now()-7*86400000).toISOString().slice(0,10), to: today },
            { label: "Месяц", from: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0,10), to: today },
          ].map(p => (
            <button key={p.label} onClick={() => setFilters(f => ({ ...f, dateFrom: p.from, dateTo: p.to }))}
              className="text-xs text-zinc-400 hover:text-amber-400 bg-zinc-800 hover:bg-zinc-700 px-3 py-1 rounded-full transition">
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="bg-red-950/50 border border-red-800 text-red-400 text-sm rounded-lg p-3">{error}</div>}

      {data && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="p-3 border-b border-zinc-800 flex items-center justify-between">
            <span className="text-zinc-400 text-sm">Найдено: <b className="text-white">{data.total}</b></span>
            <span className="text-zinc-600 text-xs">Показано: {data.items.length}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800">
                  {["Дата/Время","Оператор","Место","Штрихкод","Товар","Кол.","Длит.","Пауза","Норм.","Статус",""].map(h => (
                    <th key={h} className="text-left text-zinc-500 font-medium px-3 py-2 text-xs">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.items.map((op: any) => (
                  <tr key={op.id} className={`border-b border-zinc-800/50 hover:bg-zinc-800/30 ${op.isFlagged ? "bg-red-950/10" : ""}`}>
                    <td className="px-3 py-2 text-zinc-300 text-xs whitespace-nowrap">
                      {format(new Date(op.startTime), "dd.MM HH:mm", { locale: ru })}
                    </td>
                    <td className="px-3 py-2 text-zinc-200 text-xs max-w-[120px] truncate">{op.operatorName ?? "—"}</td>
                    <td className="px-3 py-2 text-zinc-400 text-xs">{op.workplaceName ?? "—"}</td>
                    <td className="px-3 py-2 text-zinc-400 text-xs font-mono">{op.barcode}</td>
                    <td className="px-3 py-2 text-zinc-200 text-xs max-w-[140px] truncate">{op.productName ?? op.barcode}</td>
                    <td className="px-3 py-2 text-zinc-200 text-xs text-center">{op.quantity}</td>
                    <td className="px-3 py-2 text-amber-300 text-xs font-mono">{formatSec(op.netDurationSeconds)}</td>
                    <td className="px-3 py-2 text-yellow-400 text-xs font-mono">{formatSec(op.pauseDurationSeconds)}</td>
                    <td className={`px-3 py-2 text-xs font-mono ${op.normTimeSeconds && op.netDurationSeconds > op.normTimeSeconds ? "text-red-400" : "text-green-400"}`}>
                      {op.normTimeSeconds ? formatSec(op.normTimeSeconds) : "—"}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        op.status === "completed" ? "bg-green-950 text-green-400" :
                        op.status === "active" ? "bg-blue-950 text-blue-400" :
                        "bg-zinc-800 text-zinc-400"}`}>
                        {op.status === "completed" ? "Завершена" : op.status === "active" ? "Активна" : op.status}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1">
                        <button onClick={() => setCommentOp({ id: op.id, comment: op.supervisorComment ?? "", flag: op.isFlagged, flagReason: op.flagReason ?? "" })}
                          className="p-1 text-zinc-500 hover:text-amber-400 transition" title="Комментарий">
                          <MessageSquare className="w-3.5 h-3.5" />
                        </button>
                        {op.status === "active" && (
                          <button onClick={() => handleForceStop(op.id)}
                            className="p-1 text-zinc-500 hover:text-red-400 transition" title="Принудительно завершить">
                            <Square className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {op.isFlagged && <Flag className="w-3 h-3 text-red-400" />}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Comment modal */}
      {commentOp && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-6 w-full max-w-md">
            <h3 className="text-white font-bold mb-4">Комментарий к операции #{commentOp.id}</h3>
            <textarea value={commentOp.comment} onChange={e => setCommentOp(c => c ? { ...c, comment: e.target.value } : null)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500 resize-none"
              rows={3} placeholder="Комментарий контролирующего лица..." />
            <div className="flex items-center gap-2 mt-3">
              <input type="checkbox" id="flag" checked={commentOp.flag} onChange={e => setCommentOp(c => c ? { ...c, flag: e.target.checked } : null)} className="accent-red-500" />
              <label htmlFor="flag" className="text-zinc-300 text-sm">Пометить как проблемную</label>
            </div>
            {commentOp.flag && (
              <input value={commentOp.flagReason} onChange={e => setCommentOp(c => c ? { ...c, flagReason: e.target.value } : null)}
                className="mt-2 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-red-500"
                placeholder="Причина пометки..." />
            )}
            <div className="flex gap-3 mt-4">
              <button onClick={handleSaveComment} className="flex-1 bg-amber-600 hover:bg-amber-500 text-white text-sm font-medium py-2 rounded-lg transition">Сохранить</button>
              <button onClick={() => setCommentOp(null)} className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm py-2 rounded-lg transition">Отмена</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
