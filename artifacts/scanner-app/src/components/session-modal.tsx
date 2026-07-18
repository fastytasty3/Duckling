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

const OKIU_OPTIONS = ["ОКиУ 2", "ОКиУ 3", "ОКиУ 4", "ОКиУ 5", "ОКиУ 6"];

export function SessionModal() {
  const queryClient = useQueryClient();
  const { data: session, isLoading } = useGetSession({ query: { queryKey: getGetSessionQueryKey() } });
  const { data: workplaces } = useListWorkplaces();
  const setSession = useSetSession();

  const [okiu, setOkiu] = useState<string>("");
  const [workplaceId, setWorkplaceId] = useState<string>("none");

  useEffect(() => {
    if (session?.zone) setOkiu(session.zone);
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

  const handleSave = () => {
    if (!okiu || workplaceId === "none") return;
    setSession.mutate(
      { data: { workplaceId: parseInt(workplaceId, 10), zone: okiu } },
      { onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetSessionQueryKey() }) }
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 backdrop-blur-sm">
      <div className="w-full max-w-md bg-card border border-border shadow-2xl rounded-xl p-8 space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Начало работы</h1>
          <p className="text-muted-foreground">Выберите вашу зону и рабочий стол</p>
        </div>

        <div className="space-y-4">
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
          disabled={!okiu || workplaceId === "none" || setSession.isPending}
        >
          {setSession.isPending ? "Сохранение..." : "Начать работу"}
        </Button>
      </div>
    </div>
  );
}
