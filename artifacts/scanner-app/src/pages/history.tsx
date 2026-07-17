import { useState } from "react";
import { 
  useListOperations,
  useListOperators,
  useListShifts,
  useListWorkplaces,
  useExportOperations
} from "@workspace/api-client-react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatDuration } from "@/lib/date-utils";
import { Download, Search, FilterX } from "lucide-react";

export default function History() {
  const [dateFrom, setDateFrom] = useState(format(new Date(), "yyyy-MM-dd"));
  const [dateTo, setDateTo] = useState(format(new Date(), "yyyy-MM-dd"));
  const [operatorId, setOperatorId] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [barcodeSearch, setBarcodeSearch] = useState("");

  const { data: operators } = useListOperators();

  const queryParams = {
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    operatorId: operatorId !== "all" ? parseInt(operatorId, 10) : undefined,
    status: status !== "all" ? status : undefined,
    barcode: barcodeSearch || undefined,
    limit: 100
  };

  const { data: operations, isLoading } = useListOperations(queryParams);
  const exportOps = useExportOperations();

  const handleExport = () => {
    exportOps.mutate(
      { params: { dateFrom: queryParams.dateFrom, dateTo: queryParams.dateTo, format: "csv" } },
      {
        onSuccess: (data) => {
          const blob = new Blob([data.data], { type: data.mimeType });
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = data.filename;
          a.click();
          window.URL.revokeObjectURL(url);
        }
      }
    );
  };

  const clearFilters = () => {
    setDateFrom("");
    setDateTo("");
    setOperatorId("all");
    setStatus("all");
    setBarcodeSearch("");
  };

  return (
    <div className="flex-1 p-6 space-y-6 overflow-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">История операций</h1>
        <Button onClick={handleExport} variant="outline" disabled={exportOps.isPending}>
          <Download className="mr-2 h-4 w-4" /> Экспорт CSV
        </Button>
      </div>

      <Card className="border-border bg-card">
        <CardHeader className="pb-4">
          <CardTitle className="text-lg flex items-center gap-2">
            <Search className="h-5 w-5" /> Фильтры
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="space-y-2">
              <label className="text-xs uppercase text-muted-foreground font-medium">Период с</label>
              <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
            </div>
            <div className="space-y-2">
              <label className="text-xs uppercase text-muted-foreground font-medium">Период по</label>
              <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
            </div>
            <div className="space-y-2">
              <label className="text-xs uppercase text-muted-foreground font-medium">Оператор</label>
              <Select value={operatorId} onValueChange={setOperatorId}>
                <SelectTrigger>
                  <SelectValue placeholder="Все" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все операторы</SelectItem>
                  {operators?.map(op => (
                    <SelectItem key={op.id} value={op.id.toString()}>{op.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-xs uppercase text-muted-foreground font-medium">Статус</label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger>
                  <SelectValue placeholder="Все" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все статусы</SelectItem>
                  <SelectItem value="completed">Завершено</SelectItem>
                  <SelectItem value="stopped">Остановлено</SelectItem>
                  <SelectItem value="active">В работе</SelectItem>
                  <SelectItem value="paused">На паузе</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-xs uppercase text-muted-foreground font-medium">Штрихкод / SKU</label>
              <div className="flex gap-2">
                <Input value={barcodeSearch} onChange={e => setBarcodeSearch(e.target.value)} placeholder="Поиск..." />
                <Button variant="ghost" size="icon" onClick={clearFilters} title="Сбросить фильтры">
                  <FilterX className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead className="w-[80px]">ID</TableHead>
                <TableHead>Дата / Время</TableHead>
                <TableHead>Оператор</TableHead>
                <TableHead>Товар</TableHead>
                <TableHead className="text-right">Кол-во</TableHead>
                <TableHead className="text-right">Чистое время</TableHead>
                <TableHead className="text-right">Пауза</TableHead>
                <TableHead className="text-center">Статус</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8">Загрузка...</TableCell>
                </TableRow>
              ) : operations?.items?.length ? (
                operations.items.map((op) => (
                  <TableRow key={op.id}>
                    <TableCell className="font-mono text-muted-foreground">#{op.id}</TableCell>
                    <TableCell>
                      <div className="font-medium">{format(new Date(op.startTime), "dd.MM.yyyy")}</div>
                      <div className="font-mono text-sm text-muted-foreground">
                        {format(new Date(op.startTime), "HH:mm")}
                        {op.endTime && ` - ${format(new Date(op.endTime), "HH:mm")}`}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{op.operatorName || "-"}</div>
                      <div className="text-xs text-muted-foreground">{op.shiftName || "-"}</div>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium truncate max-w-[200px]" title={op.productName || ""}>
                        {op.productName || "Неизвестный товар"}
                      </div>
                      <div className="font-mono text-xs text-muted-foreground">{op.barcode}</div>
                    </TableCell>
                    <TableCell className="text-right font-mono font-bold">{op.quantity}</TableCell>
                    <TableCell className="text-right font-mono">
                      {op.netDurationSeconds != null ? formatDuration(op.netDurationSeconds) : "-"}
                    </TableCell>
                    <TableCell className="text-right font-mono text-muted-foreground">
                      {op.pauseDurationSeconds != null && op.pauseDurationSeconds > 0 ? formatDuration(op.pauseDurationSeconds) : "-"}
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
                        {op.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                    Нет данных за выбранный период
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
