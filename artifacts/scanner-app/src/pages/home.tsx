import { useState, useEffect, useRef, useCallback } from "react";
import {
  useGetSession,
  useGetActiveOperation,
  useListOperations,
  useStopOperation,
  usePauseOperation,
  useResumeOperation,
  useUpdateOperationQuantity,
  useProcessBarcodeScan,
  getGetActiveOperationQueryKey,
  getListOperationsQueryKey,
  getGetSessionQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useClock } from "@/hooks/use-clock";
import { useActiveTimer } from "@/hooks/use-active-timer";
import { formatDuration } from "@/lib/date-utils";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Play, Pause, Square, Plus, Package, Clock, User, AlertCircle, LogOut, Users, Minus, Save, Sun, Moon, CheckCircle2 } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useFlash } from "@/components/flash-provider";

type Tab = "scanning" | "people";

export default function Home() {
  const queryClient = useQueryClient();
  const { flash } = useFlash();
  const { formattedDate, formattedTime } = useClock();
  const [activeTab, setActiveTab] = useState<Tab>("scanning");

  // People tab state
  const [peopleCount, setPeopleCount] = useState(1);
  const [peopleNames, setPeopleNames] = useState<string[]>([""]);

  const { data: session } = useGetSession({ query: { queryKey: ["/api/session"] } });

  const { data: activeData } = useGetActiveOperation({
    query: {
      queryKey: getGetActiveOperationQueryKey(),
      refetchInterval: 2000,
    },
  });

  const workplaceId = Number(sessionStorage.getItem("workplaceId")) || undefined;
  const listOpsParams = { limit: 10, ...(workplaceId ? { workplaceId } : {}) };
  const { data: recentOperations } = useListOperations(listOpsParams, {
    query: { queryKey: getListOperationsQueryKey(listOpsParams) },
  });

  const activeOp = activeData?.operation;

  const timerSeconds = useActiveTimer(
    activeOp?.startTime,
    activeOp?.netDurationSeconds,
    activeOp?.status,
    activeOp?.pauses
  );

  // ── WebSocket: register this browser tab as a workstation ──────────────────
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const workplaceId = session?.workplaceId;
    if (!workplaceId) return;

    let closed = false;
    let pingTimer: ReturnType<typeof setInterval>;

    function connect() {
      if (closed) return;
      const proto = location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(
        `${proto}//${location.host}/api/ws?type=workstation&workplaceId=${workplaceId}`
      );
      wsRef.current = ws;

      ws.onopen = () => {
        sendState(ws);
        pingTimer = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN)
            ws.send(JSON.stringify({ type: "ping" }));
        }, 15_000);
      };
      ws.onclose = () => {
        clearInterval(pingTimer);
        if (!closed) setTimeout(connect, 3000);
      };
      ws.onerror = () => ws.close();
    }

    function sendState(ws: WebSocket) {
      if (!ws || ws.readyState !== WebSocket.OPEN || !session) return;

      let status: string = "ready";
      if (activeOp) {
        if (activeOp.status === "active") status = "working";
        else if (activeOp.status === "paused") status = "paused";
      }

      const pauseSec = activeOp?.pauses
        ? (activeOp.pauses as Array<{ startTime: string; endTime: string | null }>).reduce((acc, p) => {
            if (!p.endTime) return acc;
            return acc + Math.floor((new Date(p.endTime).getTime() - new Date(p.startTime).getTime()) / 1000);
          }, 0)
        : 0;

      ws.send(JSON.stringify({
        type: "state_update",
        data: {
          workplaceId: session.workplaceId,
          workplaceName: session.workplaceName ?? `Рабочее место ${session.workplaceId}`,
          operatorId: session.operatorId ?? null,
          operatorName: session.operatorName ?? (peopleNames[0] || null),
          operatorTabNumber: null,
          shiftId: session.shiftId ?? null,
          shiftName: session.shiftName ?? (session.zone ?? null),
          loginTime: null,
          status,
          currentBarcode: activeOp?.barcode ?? null,
          currentSku: activeOp?.productSku ?? null,
          currentProductName: activeOp?.productName ?? null,
          currentQuantity: activeOp?.quantity ?? 0,
          operationStartTime: activeOp?.startTime ?? null,
          operationDurationSeconds: timerSeconds,
          pauseDurationSeconds: pauseSec,
          lastScanTime: activeOp?.startTime ?? null,
          shiftUnitsTotal: 0,
          shiftOperationsTotal: 0,
          avgSecondsPerUnit: 0,
          lastHeartbeat: new Date().toISOString(),
          peopleCount,
          peopleNames: peopleNames.filter(Boolean),
        },
      }));
    }

    connect();

    return () => {
      closed = true;
      clearInterval(pingTimer);
      wsRef.current?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.workplaceId]);

  // Send updated state to WS whenever operation changes
  useEffect(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN || !session?.workplaceId) return;

    let status: string = "ready";
    if (activeOp) {
      if (activeOp.status === "active") status = "working";
      else if (activeOp.status === "paused") status = "paused";
    }

    const pauseSec = activeOp?.pauses
      ? (activeOp.pauses as Array<{ startTime: string; endTime: string | null }>).reduce((acc, p) => {
          if (!p.endTime) return acc;
          return acc + Math.floor((new Date(p.endTime).getTime() - new Date(p.startTime).getTime()) / 1000);
        }, 0)
      : 0;

    ws.send(JSON.stringify({
      type: "state_update",
      data: {
        workplaceId: session.workplaceId,
        workplaceName: session.workplaceName ?? `Рабочее место ${session.workplaceId}`,
        operatorId: session.operatorId ?? null,
        operatorName: session.operatorName ?? (peopleNames[0] || null),
        operatorTabNumber: null,
        shiftId: session.shiftId ?? null,
        shiftName: session.shiftName ?? (session.zone ?? null),
        loginTime: null,
        status,
        currentBarcode: activeOp?.barcode ?? null,
        currentSku: activeOp?.productSku ?? null,
        currentProductName: activeOp?.productName ?? null,
        currentQuantity: activeOp?.quantity ?? 0,
        operationStartTime: activeOp?.startTime ?? null,
        operationDurationSeconds: timerSeconds,
        pauseDurationSeconds: pauseSec,
        lastScanTime: activeOp?.startTime ?? null,
        shiftUnitsTotal: 0,
        shiftOperationsTotal: 0,
        avgSecondsPerUnit: 0,
        lastHeartbeat: new Date().toISOString(),
        peopleCount,
        peopleNames: peopleNames.filter(Boolean),
      },
    }));
  }, [activeOp, timerSeconds, session, peopleCount, peopleNames]);
  // ── end WebSocket ────────────────────────────────────────────────────────────

  const [manualBarcode, setManualBarcode] = useState("");
  const processScan = useProcessBarcodeScan();

  const stopOp = useStopOperation();
  const pauseOp = usePauseOperation();
  const resumeOp = useResumeOperation();
  const updateQuantity = useUpdateOperationQuantity();

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualBarcode.trim()) return;

    processScan.mutate(
      {
        data: {
          barcode: manualBarcode.trim(),
          operatorId: session?.operatorId ?? undefined,
          shiftId: session?.shiftId ?? undefined,
          workplaceId: session?.workplaceId ?? undefined,
        },
      },
      {
        onSuccess: (res) => {
          if (res.status === "product_unknown") flash("warning");
          else flash("success");
          setManualBarcode("");
          queryClient.invalidateQueries({ queryKey: getGetActiveOperationQueryKey() });
          queryClient.invalidateQueries({ queryKey: getListOperationsQueryKey() });
        },
        onError: () => flash("error"),
      }
    );
  };

  const handleAction = (mutation: any, id: number, data?: any) => {
    mutation.mutate(data ? { id, data } : { id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetActiveOperationQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListOperationsQueryKey() });
      },
    });
  };

  // Logout operator
  const handleLogout = async () => {
    if (!confirm("Завершить рабочую сессию и выйти?")) return;
    const base = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
    const wpId = sessionStorage.getItem("workplaceId");
    await fetch(`${base}/api/session`, {
      method: "DELETE",
      headers: wpId ? { "X-Workplace-Id": wpId } : {},
    });
    sessionStorage.removeItem("workplaceId");
    queryClient.invalidateQueries({ queryKey: getGetSessionQueryKey() });
  };

  // Attendance save state
  const [attendanceSaved, setAttendanceSaved] = useState(false);
  const [attendanceSaving, setAttendanceSaving] = useState(false);

  const handleSaveAttendance = useCallback(async () => {
    if (!session?.workplaceId) return;
    setAttendanceSaving(true);
    try {
      const base = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
      await fetch(`${base}/api/session/attendance`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Workplace-Id": String(session.workplaceId),
        },
        body: JSON.stringify({
          peopleCount,
          peopleNames: peopleNames.filter(Boolean),
        }),
      });
      setAttendanceSaved(true);
      setTimeout(() => setAttendanceSaved(false), 3000);
    } finally {
      setAttendanceSaving(false);
    }
  }, [session?.workplaceId, peopleCount, peopleNames]);

  // People tab helpers
  const handlePeopleCount = (delta: number) => {
    const next = Math.max(1, Math.min(20, peopleCount + delta));
    setPeopleCount(next);
    setPeopleNames((prev) => {
      const arr = [...prev];
      while (arr.length < next) arr.push("");
      return arr.slice(0, next);
    });
  };

  const handleNameChange = (i: number, value: string) => {
    setAttendanceSaved(false);
    setPeopleNames((prev) => {
      const arr = [...prev];
      arr[i] = value;
      return arr;
    });
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-background">
      {/* Top Bar */}
      <header className="h-16 shrink-0 border-b border-border bg-card px-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <User className="h-5 w-5 text-muted-foreground" />
            <div className="flex flex-col">
              <span className="text-sm font-bold leading-none">
                {session?.workplaceName || "Рабочее место не выбрано"}
              </span>
              <span className="text-xs text-muted-foreground leading-none mt-1">
                {[session?.zone, session?.shiftName].filter(Boolean).join(" · ")}
              </span>
            </div>
          </div>
          {session?.shift && (
            <Badge variant="outline" className="gap-1 text-xs">
              {session.shift === "day"
                ? <><Sun className="h-3 w-3" /> День</>
                : <><Moon className="h-3 w-3" /> Ночь</>}
            </Badge>
          )}

          <Badge variant="outline" className="bg-success/10 text-success border-success/20 py-1 px-3">
            <div className="w-2 h-2 rounded-full bg-success mr-2 animate-pulse" />
            Готов к сканированию
          </Badge>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex flex-col items-end">
            <span className="text-xl font-mono font-bold tracking-tight text-primary">{formattedTime}</span>
            <span className="text-xs text-muted-foreground uppercase">{formattedDate}</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-destructive gap-2"
            onClick={handleLogout}
            title="Завершить сессию"
          >
            <LogOut className="h-4 w-4" />
            Выйти
          </Button>
        </div>
      </header>

      {/* Tab Bar */}
      <div className="border-b border-border bg-card shrink-0">
        <div className="flex px-6">
          {(["scanning", "people"] as Tab[]).map((tab) => {
            const labels: Record<Tab, string> = { scanning: "Сканирование", people: "Количество людей" };
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {labels[tab]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      {activeTab === "scanning" ? (
        <div className="flex-1 overflow-auto p-6 space-y-6">
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

            {/* Active Operation Card */}
            <Card className="xl:col-span-2 border-border shadow-xl bg-card relative overflow-hidden flex flex-col min-h-[360px]">
              {activeOp?.status === "active" && (
                <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/4 pointer-events-none" />
              )}
              {activeOp?.status === "paused" && (
                <div className="absolute top-0 right-0 w-64 h-64 bg-warning/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/4 pointer-events-none" />
              )}

              <CardHeader className="pb-4 border-b border-border/50 bg-muted/20">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-2xl uppercase tracking-wider">
                    <Package className="h-6 w-6 text-primary" />
                    Текущая операция
                  </CardTitle>
                  {activeOp && (
                    <Badge
                      variant={activeOp.status === "active" ? "default" : "secondary"}
                      className={`text-sm py-1 px-3 ${activeOp.status === "active" ? "bg-primary text-primary-foreground" : "bg-warning/20 text-warning"}`}
                    >
                      {activeOp.status === "active" ? "В работе" : activeOp.status === "paused" ? "Пауза" : activeOp.status}
                    </Badge>
                  )}
                </div>
              </CardHeader>

              <CardContent className="p-6 flex-1 flex flex-col justify-center">
                {activeOp ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center h-full">
                    <div className="space-y-6">
                      <div>
                        <div className="text-sm font-medium text-muted-foreground mb-1 uppercase tracking-wider">Товар</div>
                        <div className="text-3xl font-bold leading-tight">
                          {activeOp.productName || "Неизвестный товар"}
                        </div>
                        {(activeOp.productSku || activeOp.barcode) && (
                          <div className="text-lg text-muted-foreground font-mono mt-2">
                            {activeOp.productSku && `SKU: ${activeOp.productSku} | `}
                            {activeOp.barcode}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-8">
                        <div>
                          <div className="text-sm font-medium text-muted-foreground mb-1 uppercase tracking-wider">Количество</div>
                          <div className="text-4xl font-bold text-foreground">
                            {activeOp.quantity} <span className="text-lg text-muted-foreground font-normal">шт</span>
                          </div>
                        </div>
                        <div>
                          <div className="text-sm font-medium text-muted-foreground mb-1 uppercase tracking-wider">Старт</div>
                          <div className="text-2xl font-mono text-foreground">
                            {format(new Date(activeOp.startTime), "HH:mm:ss")}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col items-center justify-center p-8 bg-background/50 rounded-2xl border border-border">
                      <div className="text-sm font-medium text-muted-foreground mb-4 uppercase tracking-widest text-center">Чистое время</div>
                      <div className="text-7xl md:text-8xl font-black font-mono tracking-tighter text-primary drop-shadow-sm tabular-nums">
                        {formatDuration(timerSeconds)}
                      </div>

                      {activeOp.normTimeSeconds && (
                        <div className="mt-4 text-sm font-medium">
                          Норма: <span className="font-mono">{formatDuration(activeOp.normTimeSeconds)}</span>
                        </div>
                      )}

                      <div className="flex items-center gap-3 mt-8 w-full">
                        {activeOp.status === "active" ? (
                          <Button
                            size="lg"
                            variant="outline"
                            className="flex-1 h-16 text-lg border-warning/50 text-warning hover:bg-warning hover:text-warning-foreground"
                            onClick={() => handleAction(pauseOp, activeOp.id)}
                            disabled={pauseOp.isPending}
                          >
                            <Pause className="mr-2 h-6 w-6" /> Пауза
                          </Button>
                        ) : (
                          <Button
                            size="lg"
                            variant="outline"
                            className="flex-1 h-16 text-lg border-success/50 text-success hover:bg-success hover:text-success-foreground"
                            onClick={() => handleAction(resumeOp, activeOp.id)}
                            disabled={resumeOp.isPending}
                          >
                            <Play className="mr-2 h-6 w-6" /> Продолжить
                          </Button>
                        )}
                        <Button
                          size="lg"
                          variant="default"
                          className="flex-1 h-16 text-lg bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          onClick={() => handleAction(stopOp, activeOp.id)}
                          disabled={stopOp.isPending}
                        >
                          <Square className="mr-2 h-6 w-6" /> Остановить
                        </Button>
                      </div>
                      <Button
                        size="lg"
                        variant="ghost"
                        className="w-full mt-3 h-12"
                        onClick={() => handleAction(updateQuantity, activeOp.id, { delta: 1 })}
                        disabled={updateQuantity.isPending}
                      >
                        <Plus className="mr-2 h-5 w-5" /> Добавить количество (+1)
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center text-muted-foreground h-full py-12">
                    <div className="w-24 h-24 rounded-full bg-muted/30 flex items-center justify-center mb-6">
                      <ScanLine className="h-12 w-12 opacity-50" />
                    </div>
                    <h3 className="text-2xl font-bold text-foreground">Нет активной операции</h3>
                    <p className="mt-2 text-lg">Отсканируйте штрихкод для начала работы</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Manual Entry & Info */}
            <div className="space-y-6">
              <Card className="border-border shadow-lg">
                <CardHeader>
                  <CardTitle className="text-lg">Ручной ввод</CardTitle>
                  <CardDescription>Введите штрихкод вручную</CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleManualSubmit} className="flex gap-2">
                    <Input
                      name="barcode"
                      placeholder="Штрихкод..."
                      value={manualBarcode}
                      onChange={(e) => setManualBarcode(e.target.value)}
                      className="h-12 text-lg font-mono"
                      autoComplete="off"
                    />
                    <Button type="submit" size="lg" className="h-12 w-12 p-0 shrink-0" disabled={processScan.isPending}>
                      <Plus className="h-6 w-6" />
                    </Button>
                  </form>
                </CardContent>
              </Card>

              <Card className="border-border shadow-lg flex-1">
                <CardHeader>
                  <CardTitle className="text-lg">Информация</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 text-sm">
                  <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                    <AlertCircle className="h-5 w-5 text-primary shrink-0" />
                    <span>Сканер работает в фоновом режиме. Вы можете сканировать в любой момент.</span>
                  </div>
                  <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                    <Clock className="h-5 w-5 text-primary shrink-0" />
                    <span>Автостоп операции: <strong>Включен</strong></span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Recent Operations Table */}
          <Card className="border-border shadow-lg">
            <CardHeader className="pb-3 border-b border-border/50">
              <CardTitle className="text-lg">Последние операции</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30 hover:bg-muted/30">
                    <TableHead className="w-[100px] text-xs uppercase">Время</TableHead>
                    <TableHead className="text-xs uppercase">Штрихкод / SKU</TableHead>
                    <TableHead className="text-xs uppercase">Товар</TableHead>
                    <TableHead className="text-right text-xs uppercase">Кол-во</TableHead>
                    <TableHead className="text-right text-xs uppercase">Длительность</TableHead>
                    <TableHead className="text-center text-xs uppercase">Статус</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentOperations?.items?.length ? (
                    recentOperations.items.map((op) => (
                      <TableRow key={op.id} className="group">
                        <TableCell className="font-mono text-sm whitespace-nowrap">
                          {format(new Date(op.startTime), "HH:mm")}
                          {op.endTime && <span className="text-muted-foreground block text-xs">{format(new Date(op.endTime), "HH:mm")}</span>}
                        </TableCell>
                        <TableCell>
                          <div className="font-mono text-sm">{op.barcode}</div>
                          {op.productSku && <div className="text-xs text-muted-foreground">{op.productSku}</div>}
                        </TableCell>
                        <TableCell className="font-medium max-w-[200px] truncate" title={op.productName || ""}>
                          {op.productName || <span className="text-muted-foreground">Неизвестный товар</span>}
                        </TableCell>
                        <TableCell className="text-right font-mono font-medium text-lg">{op.quantity}</TableCell>
                        <TableCell className="text-right font-mono">
                          {op.netDurationSeconds != null ? formatDuration(op.netDurationSeconds) : "-"}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge
                            variant="outline"
                            className={
                              op.status === "completed" ? "border-success text-success" :
                              op.status === "stopped" ? "border-destructive text-destructive" :
                              "border-primary text-primary"
                            }
                          >
                            {op.status === "completed" ? "Завершено" : op.status === "stopped" ? "Остановлено" : op.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        Нет операций за сегодня
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      ) : (
        /* ── Количество людей ── */
        <div className="flex-1 overflow-auto p-6">
          <Card className="max-w-lg mx-auto border-border shadow-xl">
            <CardHeader className="border-b border-border/50">
              <CardTitle className="flex items-center gap-2 text-xl">
                <Users className="h-5 w-5 text-primary" />
                Количество людей на смене
              </CardTitle>
              <CardDescription>
                {session?.workplaceName} · {session?.zone}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              {/* Counter */}
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Сотрудников</span>
                <div className="flex items-center gap-4">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-10 w-10 rounded-full"
                    onClick={() => handlePeopleCount(-1)}
                    disabled={peopleCount <= 1}
                  >
                    <Minus className="h-4 w-4" />
                  </Button>
                  <span className="text-4xl font-black tabular-nums w-12 text-center text-primary">{peopleCount}</span>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-10 w-10 rounded-full"
                    onClick={() => handlePeopleCount(1)}
                    disabled={peopleCount >= 20}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* FIO list */}
              <div className="space-y-3">
                {Array.from({ length: peopleCount }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <span className="text-sm font-medium text-muted-foreground w-6 text-right shrink-0">{i + 1}.</span>
                    <Input
                      value={peopleNames[i] ?? ""}
                      onChange={(e) => handleNameChange(i, e.target.value)}
                      placeholder={`ФИО сотрудника ${i + 1}`}
                      className="h-11 text-sm"
                    />
                  </div>
                ))}
              </div>

              {/* Summary */}
              {peopleNames.some((n) => n.trim()) && (
                <div className="rounded-lg bg-muted/40 border border-border p-4 text-sm space-y-1">
                  <div className="font-medium text-muted-foreground uppercase tracking-wider text-xs mb-2">Список сотрудников</div>
                  {peopleNames.map((name, i) =>
                    name.trim() ? (
                      <div key={i} className="text-foreground">
                        <span className="text-muted-foreground font-mono">{i + 1}. </span>{name.trim()}
                      </div>
                    ) : null
                  )}
                </div>
              )}

              {/* Save button */}
              <Button
                className="w-full h-12 text-base font-semibold gap-2"
                onClick={handleSaveAttendance}
                disabled={attendanceSaving || attendanceSaved}
                variant={attendanceSaved ? "outline" : "default"}
              >
                {attendanceSaved ? (
                  <><CheckCircle2 className="h-5 w-5 text-success" /> Явка сохранена</>
                ) : attendanceSaving ? (
                  "Сохранение..."
                ) : (
                  <><Save className="h-5 w-5" /> Сохранить явку в отчёт</>
                )}
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function ScanLine({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M3 7V5a2 2 0 0 1 2-2h2" />
      <path d="M17 3h2a2 2 0 0 1 2 2v2" />
      <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
      <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
      <line x1="7" x2="7" y1="8" y2="16" />
      <line x1="12" x2="12" y1="8" y2="16" />
      <line x1="17" x2="17" y1="8" y2="16" />
    </svg>
  );
}
