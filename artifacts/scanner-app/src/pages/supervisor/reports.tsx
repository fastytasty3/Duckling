import { useState } from "react";
import { supervisorApi } from "@/lib/api";
import { Download, TrendingUp, TrendingDown, Users, Package, Clock } from "lucide-react";
import { formatDuration } from "@/lib/date-utils";

export default function SupervisorReports() {
  const today = new Date().toISOString().slice(0, 10);
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo]     = useState(today);
  const [tab, setTab] = useState<"by-operator" | "by-product" | "flagged">("by-operator");
  const [data, setData] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true); setError("");
    try {
      const params: Record<string, string> = { dateFrom, dateTo };
      if (tab === "by-operator") {
        const res = await supervisorApi.history({ ...params, limit: "1000", offset: "0" });
        // Aggregate by operator
        const map = new Map<string, any>();
        for (const op of res.items) {
          if (op.status !== "completed") continue;
          const k = op.operatorName ?? "Неизвестный";
          if (!map.has(k)) map.set(k, { operatorName: k, tabNumber: op.operatorTabNumber, ops: 0, units: 0, netSec: 0, pauseSec: 0, aboveNorm: 0, withNorm: 0 });
          const e = map.get(k)!;
          e.ops++; e.units += op.quantity; e.netSec += op.netDurationSeconds ?? 0; e.pauseSec += op.pauseDurationSeconds ?? 0;
          if (op.normTimeSeconds) { e.withNorm++; if ((op.netDurationSeconds ?? 0) > op.normTimeSeconds) e.aboveNorm++; }
        }
        setData(Array.from(map.values()).sort((a, b) => b.ops - a.ops));
      } else if (tab === "by-product") {
        const res = await supervisorApi.history({ ...params, limit: "1000", offset: "0" });
        const map = new Map<string, any>();
        for (const op of res.items) {
          if (op.status !== "completed") continue;
          const k = op.barcode;
          if (!map.has(k)) map.set(k, { barcode: k, name: op.productName ?? k, sku: op.productSku, ops: 0, units: 0, netSec: 0, norm: op.normTimeSeconds, nets: [] });
          const e = map.get(k)!;
          e.ops++; e.units += op.quantity; e.netSec += op.netDurationSeconds ?? 0;
          if (op.netDurationSeconds) e.nets.push(op.netDurationSeconds);
        }
        setData(Array.from(map.values()).map(e => ({
          ...e, avg: e.nets.length ? Math.round(e.netSec / e.nets.length) : 0,
          min: e.nets.length ? Math.min(...e.nets) : 0, max: e.nets.length ? Math.max(...e.nets) : 0,
        })).sort((a, b) => b.ops - a.ops));
      } else {
        const res = await supervisorApi.flaggedOperations(params);
        setData(res);
      }
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  const getExcelUrl = () => supervisorApi.exportExcel({ dateFrom, dateTo });

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="text-zinc-400 text-xs">Дата с</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              className="mt-1 block bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500" />
          </div>
          <div>
            <label className="text-zinc-400 text-xs">Дата по</label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              className="mt-1 block bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500" />
          </div>
          <div className="flex gap-2 flex-wrap">
            {[
              { label: "Сегодня", from: today, to: today },
              { label: "7 дней", from: new Date(Date.now()-7*86400000).toISOString().slice(0,10), to: today },
              { label: "Месяц", from: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0,10), to: today },
            ].map(p => (
              <button key={p.label} onClick={() => { setDateFrom(p.from); setDateTo(p.to); }}
                className="text-xs text-zinc-400 hover:text-amber-400 bg-zinc-800 hover:bg-zinc-700 px-3 py-2 rounded-lg transition">
                {p.label}
              </button>
            ))}
          </div>
          <div className="flex gap-2 ml-auto">
            <button onClick={load} disabled={loading}
              className="bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-sm font-medium py-2 px-4 rounded-lg transition">
              {loading ? "..." : "Загрузить"}
            </button>
            <a href={getExcelUrl()} download target="_blank"
              className="bg-green-700 hover:bg-green-600 text-white text-sm font-medium py-2 px-3 rounded-lg transition flex items-center gap-1.5">
              <Download className="w-4 h-4" /> Excel
            </a>
          </div>
        </div>

        <div className="flex gap-1 mt-4 border-b border-zinc-800">
          {([
            { id: "by-operator", label: "По операторам", icon: <Users className="w-3.5 h-3.5" /> },
            { id: "by-product",  label: "По товарам",    icon: <Package className="w-3.5 h-3.5" /> },
            { id: "flagged",     label: "Проблемные",    icon: <TrendingUp className="w-3.5 h-3.5" /> },
          ] as const).map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm transition border-b-2 ${tab === t.id ? "border-amber-500 text-amber-400" : "border-transparent text-zinc-500 hover:text-zinc-300"}`}>
              {t.icon}{t.label}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="bg-red-950/50 border border-red-800 text-red-400 text-sm rounded-lg p-3">{error}</div>}

      {/* Tables */}
      {data && tab === "by-operator" && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-zinc-800">
              {["ФИО","Таб.","Операций","Единиц","Чистое время","Паузы","Ср. время","Ср. на ед.","Норм. (%)","Свыше норм."].map(h =>
                <th key={h} className="text-left text-zinc-500 font-medium px-3 py-2 text-xs">{h}</th>)}
            </tr></thead>
            <tbody>
              {data.map((r: any, i: number) => (
                <tr key={i} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                  <td className="px-3 py-2 text-white font-medium text-xs">{r.operatorName}</td>
                  <td className="px-3 py-2 text-zinc-400 text-xs">{r.tabNumber ?? "—"}</td>
                  <td className="px-3 py-2 text-zinc-200 text-xs">{r.ops}</td>
                  <td className="px-3 py-2 text-zinc-200 text-xs">{r.units}</td>
                  <td className="px-3 py-2 text-amber-300 font-mono text-xs">{formatDuration(r.netSec)}</td>
                  <td className="px-3 py-2 text-yellow-400 font-mono text-xs">{formatDuration(r.pauseSec)}</td>
                  <td className="px-3 py-2 text-zinc-300 font-mono text-xs">{r.ops > 0 ? formatDuration(Math.round(r.netSec/r.ops)) : "—"}</td>
                  <td className="px-3 py-2 text-zinc-300 font-mono text-xs">{r.units > 0 ? formatDuration(Math.round(r.netSec/r.units)) : "—"}</td>
                  <td className="px-3 py-2 text-xs">{r.withNorm > 0 ? `${Math.round((r.withNorm-r.aboveNorm)/r.withNorm*100)}%` : "—"}</td>
                  <td className={`px-3 py-2 text-xs ${r.aboveNorm > 0 ? "text-red-400" : "text-green-400"}`}>{r.aboveNorm}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && tab === "by-product" && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-zinc-800">
              {["Штрихкод","Артикул","Наименование","Оп.","Ед.","Мин.","Макс.","Среднее","Норм.","Откл."].map(h =>
                <th key={h} className="text-left text-zinc-500 font-medium px-3 py-2 text-xs">{h}</th>)}
            </tr></thead>
            <tbody>
              {data.map((r: any, i: number) => {
                const dev = r.norm ? r.avg - r.norm : null;
                return (
                  <tr key={i} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                    <td className="px-3 py-2 text-zinc-400 font-mono text-xs">{r.barcode}</td>
                    <td className="px-3 py-2 text-zinc-400 text-xs">{r.sku ?? "—"}</td>
                    <td className="px-3 py-2 text-white text-xs max-w-[160px] truncate">{r.name}</td>
                    <td className="px-3 py-2 text-zinc-200 text-xs">{r.ops}</td>
                    <td className="px-3 py-2 text-zinc-200 text-xs">{r.units}</td>
                    <td className="px-3 py-2 text-green-400 font-mono text-xs">{r.min ? `${r.min}с` : "—"}</td>
                    <td className="px-3 py-2 text-red-400 font-mono text-xs">{r.max ? `${r.max}с` : "—"}</td>
                    <td className="px-3 py-2 text-amber-300 font-mono text-xs">{r.avg ? `${r.avg}с` : "—"}</td>
                    <td className="px-3 py-2 text-zinc-300 font-mono text-xs">{r.norm ? `${r.norm}с` : "—"}</td>
                    <td className={`px-3 py-2 font-mono text-xs ${dev != null ? (dev > 0 ? "text-red-400" : "text-green-400") : "text-zinc-500"}`}>
                      {dev != null ? `${dev > 0 ? "+" : ""}${dev}с` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {data && tab === "flagged" && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          {data.length === 0 ? (
            <div className="text-center py-10 text-zinc-600">Проблемных операций не найдено</div>
          ) : (
            <table className="w-full text-sm">
              <thead><tr className="border-b border-zinc-800">
                {["Дата","Оператор","Место","Товар","Статус","Причина","Комментарий"].map(h =>
                  <th key={h} className="text-left text-zinc-500 font-medium px-3 py-2 text-xs">{h}</th>)}
              </tr></thead>
              <tbody>
                {data.map((op: any) => (
                  <tr key={op.id} className="border-b border-zinc-800/50 bg-red-950/10">
                    <td className="px-3 py-2 text-zinc-400 text-xs">{new Date(op.startTime).toLocaleDateString("ru-RU")}</td>
                    <td className="px-3 py-2 text-zinc-200 text-xs">{op.operatorName ?? "—"}</td>
                    <td className="px-3 py-2 text-zinc-400 text-xs">{op.workplaceName ?? "—"}</td>
                    <td className="px-3 py-2 text-white text-xs">{op.productName ?? op.barcode}</td>
                    <td className="px-3 py-2 text-xs"><span className="bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded-full">{op.status}</span></td>
                    <td className="px-3 py-2 text-red-400 text-xs">{op.flagReason ?? "—"}</td>
                    <td className="px-3 py-2 text-zinc-400 text-xs">{op.supervisorComment ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
