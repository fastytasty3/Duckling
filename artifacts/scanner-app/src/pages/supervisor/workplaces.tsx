import { useState, useEffect } from "react";
import { Plus, Edit2, Trash2, X, Check } from "lucide-react";

const OKIU_OPTIONS = ["ОКиУ 2", "ОКиУ 3", "ОКиУ 4", "ОКиУ 5", "ОКиУ 6"];

interface Workplace {
  id: number;
  name: string;
  zone: string | null;
  active: boolean;
}

async function apiFetch(path: string, options?: RequestInit) {
  const base = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
  const res = await fetch(`${base}${path}`, {
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    ...options,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(text || res.statusText);
  }
  return res.json();
}

const emptyForm = { name: "", zone: "", active: true };

export default function SupervisorWorkplaces() {
  const [workplaces, setWorkplaces] = useState<Workplace[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    apiFetch("/api/workplaces")
      .then(setWorkplaces)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setShowForm(true);
  };

  const openEdit = (wp: Workplace) => {
    setEditingId(wp.id);
    setForm({ name: wp.name, zone: wp.zone ?? "", active: wp.active });
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const body = { name: form.name.trim(), zone: form.zone.trim() || null, active: form.active };
      if (editingId) {
        await apiFetch(`/api/workplaces/${editingId}`, { method: "PATCH", body: JSON.stringify(body) });
      } else {
        await apiFetch("/api/workplaces", { method: "POST", body: JSON.stringify(body) });
      }
      setShowForm(false);
      load();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (wp: Workplace) => {
    if (!confirm(`Удалить рабочий стол «${wp.name}»?`)) return;
    try {
      await apiFetch(`/api/workplaces/${wp.id}`, { method: "DELETE" });
      load();
    } catch (e: any) {
      alert(e.message);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          onClick={openCreate}
          className="flex items-center gap-2 bg-amber-600 hover:bg-amber-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition"
        >
          <Plus className="w-4 h-4" /> Добавить рабочий стол
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 grid grid-cols-2 gap-3"
        >
          <div>
            <label className="text-zinc-400 text-xs">Название *</label>
            <input
              required
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              placeholder="Стол 1"
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500"
            />
          </div>

          <div>
            <label className="text-zinc-400 text-xs">ОКиУ (зона)</label>
            <select
              value={form.zone}
              onChange={(e) => setForm((p) => ({ ...p, zone: e.target.value }))}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500"
            >
              <option value="">— не назначена —</option>
              {OKIU_OPTIONS.map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
            <p className="text-zinc-600 text-[10px] mt-1">Оператор видит только столы своего ОКиУ при входе</p>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="wp-active"
              checked={form.active}
              onChange={(e) => setForm((p) => ({ ...p, active: e.target.checked }))}
              className="accent-amber-500"
            />
            <label htmlFor="wp-active" className="text-zinc-300 text-sm">Активно</label>
          </div>

          <div className="col-span-2 flex gap-3">
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition"
            >
              <Check className="w-4 h-4" /> {saving ? "Сохранение..." : "Сохранить"}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm px-4 py-2 rounded-lg transition"
            >
              <X className="w-4 h-4" /> Отмена
            </button>
          </div>
        </form>
      )}

      {error && <div className="text-red-400 text-sm">{error}</div>}

      {loading ? (
        <div className="text-zinc-500 text-sm text-center py-10">Загрузка...</div>
      ) : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800">
                {["Название", "ОКиУ (зона)", "Статус", "Действия"].map((h) => (
                  <th key={h} className="text-left text-zinc-500 font-medium px-4 py-2 text-xs">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {workplaces.length === 0 ? (
                <tr>
                  <td colSpan={4} className="text-center text-zinc-600 py-10 text-sm">
                    Нет рабочих столов. Добавьте первый.
                  </td>
                </tr>
              ) : (
                workplaces.map((wp) => (
                  <tr key={wp.id} className={`border-b border-zinc-800/50 hover:bg-zinc-800/20 ${!wp.active ? "opacity-50" : ""}`}>
                    <td className="px-4 py-2 text-white text-xs font-medium">{wp.name}</td>
                    <td className="px-4 py-2 text-xs">
                      {wp.zone ? (
                        <span className="px-2 py-0.5 rounded-full bg-amber-950 text-amber-400 text-xs">{wp.zone}</span>
                      ) : (
                        <span className="text-yellow-600 text-xs">не назначена</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-xs">
                      <span className={`px-2 py-0.5 rounded-full text-xs ${wp.active ? "bg-green-950 text-green-400" : "bg-zinc-800 text-zinc-500"}`}>
                        {wp.active ? "Активно" : "Неактивно"}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => openEdit(wp)}
                          className="p-1 text-zinc-500 hover:text-amber-400 transition"
                          title="Редактировать"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(wp)}
                          className="p-1 text-zinc-500 hover:text-red-400 transition"
                          title="Удалить"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
