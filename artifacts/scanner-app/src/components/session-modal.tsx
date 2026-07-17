import { useState, useEffect } from "react";
import { 
  useGetSession, 
  useSetSession, 
  useListOperators, 
  useListShifts, 
  useListWorkplaces,
  getGetSessionQueryKey
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQueryClient } from "@tanstack/react-query";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";

export function SessionModal() {
  const queryClient = useQueryClient();
  const { data: session, isLoading: isSessionLoading } = useGetSession({ query: { queryKey: getGetSessionQueryKey() } });
  
  const { data: operators } = useListOperators({ activeOnly: true });
  const { data: shifts } = useListShifts();
  const { data: workplaces } = useListWorkplaces();

  const setSession = useSetSession();

  const [operatorId, setOperatorId] = useState<string>("");
  const [shiftId, setShiftId] = useState<string>("");
  const [workplaceId, setWorkplaceId] = useState<string>("none");

  useEffect(() => {
    if (session?.operatorId) setOperatorId(session.operatorId.toString());
    if (session?.shiftId) setShiftId(session.shiftId.toString());
    if (session?.workplaceId) setWorkplaceId(session.workplaceId.toString());
  }, [session]);

  if (isSessionLoading) return null;
  if (session && session.operatorId) return null; // Session is valid

  const handleSave = () => {
    if (!operatorId || !shiftId) return;

    setSession.mutate(
      { 
        data: { 
          operatorId: parseInt(operatorId, 10), 
          shiftId: parseInt(shiftId, 10), 
          workplaceId: workplaceId !== "none" ? parseInt(workplaceId, 10) : undefined 
        } 
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetSessionQueryKey() });
        }
      }
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 backdrop-blur-sm">
      <div className="w-full max-w-md bg-card border border-border shadow-2xl rounded-xl p-8 space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Смена</h1>
          <p className="text-muted-foreground">Укажите данные для начала работы</p>
        </div>

        {!operators?.length && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Ошибка</AlertTitle>
            <AlertDescription>
              Справочник операторов пуст. Пожалуйста, добавьте операторов через настройки.
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Оператор <span className="text-destructive">*</span></label>
            <Select value={operatorId} onValueChange={setOperatorId}>
              <SelectTrigger className="w-full h-12 text-lg">
                <SelectValue placeholder="Выберите оператора" />
              </SelectTrigger>
              <SelectContent>
                {operators?.map((op) => (
                  <SelectItem key={op.id} value={op.id.toString()}>
                    {op.name} {op.tabNumber ? `(${op.tabNumber})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Смена <span className="text-destructive">*</span></label>
            <Select value={shiftId} onValueChange={setShiftId}>
              <SelectTrigger className="w-full h-12 text-lg">
                <SelectValue placeholder="Выберите смену" />
              </SelectTrigger>
              <SelectContent>
                {shifts?.map((shift) => (
                  <SelectItem key={shift.id} value={shift.id.toString()}>
                    {shift.name} {shift.timeStart && shift.timeEnd ? `(${shift.timeStart} - ${shift.timeEnd})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Рабочее место</label>
            <Select value={workplaceId} onValueChange={setWorkplaceId}>
              <SelectTrigger className="w-full h-12 text-lg">
                <SelectValue placeholder="Не выбрано (опционально)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Не выбрано</SelectItem>
                {workplaces?.map((wp) => (
                  <SelectItem key={wp.id} value={wp.id.toString()}>
                    {wp.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Button 
          className="w-full h-14 text-lg font-bold uppercase tracking-wider" 
          onClick={handleSave} 
          disabled={!operatorId || !shiftId || setSession.isPending}
        >
          {setSession.isPending ? "Сохранение..." : "Начать работу"}
        </Button>
      </div>
    </div>
  );
}
