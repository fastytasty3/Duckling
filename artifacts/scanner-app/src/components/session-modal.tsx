import { useState, useEffect } from "react";
import {
  useGetSession,
  useSetSession,
  useListWorkplaces,
  getGetSessionQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQueryClient } from "@tanstack/react-query";
import { Sun, Moon } from "lucide-react";

const OKIU_OPTIONS = ["ОКиУ 2", "ОКиУ 3", "ОКиУ 4", "ОКиУ 5", "ОКиУ 6"];

const SHIFTS = [
  { value: "day" as const, label: "Дневная", hours: "09:00 – 21:00", icon: Sun },
  { value: "night" as const, label: "Ночная", hours: "21:00 – 09:00", icon: Moon },
];

export function SessionModal() {
  const queryClient = useQueryClient();
  const { data: session, isLoading } = useGetSession({ query: { queryKey: getGetSessionQueryKey() } });
  const { data: workplaces } = useListWorkplaces();
  const setSession = useSetSession();

  const [okiu, setOkiu] = useState<string>("");
  const [shift, setShift] = useState<"day" | "night" | "">("");
  const [workplaceId, setWorkplaceId] = useState<string>("none");

  useEffect(() => {
    if (session?.zone) setOkiu(session.zone);
    if (session?.shift) setShift(session.shift);
    if (session?.workplaceId) setWorkplaceId(session.workplaceId.toString());
  }, [session]);

  // Reset workplace when ОКиУ changes
  useEffect(() => {
    setWorkplaceId("none");
  }, [okiu]);

  if (isLoading) return null;
  if (session?.workplaceId) return null; // Session active

  const filtered = okiu
    ? (workplaces ?? []).filter((wp) => wp.zone === okiu && wp.active !== false)
    : [];

  const canSave = !!okiu && !!shift && workplaceId !== "none";

  const handleSave = () => {
    if (!canSave) return;
    const wpId = parseInt(workplaceId, 10);
    setSession.mutate(
      { data: { workplaceId: wpId, zone: okiu, shift: shift as "day" | "night" } },
      {
        onSuccess: () => {
          // Persist workplaceId so every subsequent API request carries X-Workplace-Id
          sessionStorage.setItem("workplaceId", String(wpId));
          queryClient.invalidateQueries({ queryKey: getGetSessionQueryKey() });
        },
      }
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 backdrop-blur-sm">
      <div className="w-full max-w-md bg-card border border-border shadow-2xl rounded-xl p-8 space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Начало работы</h1>
          <p className="text-muted-foreground">Выберите смену, зону и рабочий стол</p>
        </div>

        <div className="space-y-4">
          {/* Shift selector */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              Смена <span className="text-destructive">*</span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              {SHIFTS.map(({ value, label, hours, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setShift(value)}
                  className={`flex flex-col items-center gap-1.5 rounded-xl border-2 p-4 transition-all cursor-pointer ${
                    shift === value
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-muted/30 text-muted-foreground hover:border-border hover:bg-muted/60"
                  }`}
                >
                  <Icon className="h-6 w-6" />
                  <span className="text-sm font-bold">{label}</span>
                  <span className="text-xs font-mono opacity-75">{hours}</span>
                </button>
              ))}
            </div>
          </div>

          {/* ОКиУ selector */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              ОКиУ <span className="text-destructive">*</span>
            </label>
            <Select value={okiu} onValueChange={setOkiu}>
              <SelectTrigger className="w-full h-12 text-lg">
                <SelectValue placeholder="Выберите ОКиУ" />
              </SelectTrigger>
              <SelectContent>
                {OKIU_OPTIONS.map((o) => (
                  <SelectItem key={o} value={o}>{o}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Workplace selector — filtered by chosen ОКиУ */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              Рабочий стол <span className="text-destructive">*</span>
            </label>
            <Select value={workplaceId} onValueChange={setWorkplaceId} disabled={!okiu}>
              <SelectTrigger className="w-full h-12 text-lg">
                <SelectValue placeholder={okiu ? "Выберите стол" : "Сначала выберите ОКиУ"} />
              </SelectTrigger>
              <SelectContent>
                {filtered.length === 0 ? (
                  <SelectItem value="none" disabled>
                    {okiu ? "Нет столов для этого ОКиУ" : "Сначала выберите ОКиУ"}
                  </SelectItem>
                ) : (
                  filtered.map((wp) => (
                    <SelectItem key={wp.id} value={wp.id.toString()}>{wp.name}</SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            {okiu && filtered.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Столы для {okiu} ещё не созданы. Создайте их в разделе «Операторы и смены».
              </p>
            )}
          </div>
        </div>

        <Button
          className="w-full h-14 text-lg font-bold uppercase tracking-wider"
          onClick={handleSave}
          disabled={!canSave || setSession.isPending}
        >
          {setSession.isPending ? "Сохранение..." : "Начать работу"}
        </Button>
      </div>
    </div>
  );
}
