import { useState } from "react";
import { 
  useGetReportSummary, 
  useGetReportByProduct,
  useGetReportByHour,
  useListOperators
} from "@workspace/api-client-react";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDuration } from "@/lib/date-utils";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line
} from "recharts";
import { Package, Clock, Zap, Target, TrendingUp, AlertTriangle } from "lucide-react";

export default function Reports() {
  const [dateFrom, setDateFrom] = useState(format(new Date(), "yyyy-MM-dd"));
  const [dateTo, setDateTo] = useState(format(new Date(), "yyyy-MM-dd"));
  const [operatorId, setOperatorId] = useState<string>("all");

  const { data: operators } = useListOperators();

  const params = {
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    operatorId: operatorId !== "all" ? parseInt(operatorId, 10) : undefined,
  };

  const { data: summary } = useGetReportSummary(params);
  const { data: productStats } = useGetReportByProduct(params);
  const { data: hourStats } = useGetReportByHour(params);

  const formatChartTime = (seconds: number) => Math.round(seconds / 60);

  return (
    <div className="flex-1 p-6 space-y-6 overflow-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Аналитика и Отчёты</h1>
        
        <div className="flex items-center gap-4 bg-card border border-border p-2 rounded-lg">
          <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-40 h-9" />
          <span className="text-muted-foreground">-</span>
          <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-40 h-9" />
          
          <div className="w-px h-6 bg-border mx-2" />
          
          <Select value={operatorId} onValueChange={setOperatorId}>
            <SelectTrigger className="w-48 h-9 border-none bg-transparent">
              <SelectValue placeholder="Оператор" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все операторы</SelectItem>
              {operators?.map(op => (
                <SelectItem key={op.id} value={op.id.toString()}>{op.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="bg-card">
          <CardContent className="p-6 flex flex-col justify-between h-full">
            <div className="flex items-center justify-between mb-4">
              <div className="text-sm font-medium uppercase tracking-wider text-muted-foreground">Обработано единиц</div>
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                <Package className="h-5 w-5" />
              </div>
            </div>
            <div>
              <div className="text-4xl font-bold">{summary?.totalUnits || 0}</div>
              <div className="text-sm text-muted-foreground mt-1">в {summary?.totalOperations || 0} операциях</div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card">
          <CardContent className="p-6 flex flex-col justify-between h-full">
            <div className="flex items-center justify-between mb-4">
              <div className="text-sm font-medium uppercase tracking-wider text-muted-foreground">Чистое время</div>
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                <Clock className="h-5 w-5" />
              </div>
            </div>
            <div>
              <div className="text-4xl font-bold font-mono">{formatDuration(summary?.totalNetSeconds || 0)}</div>
              <div className="text-sm text-muted-foreground mt-1">
                Паузы: {formatDuration(summary?.totalPauseSeconds || 0)}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card">
          <CardContent className="p-6 flex flex-col justify-between h-full">
            <div className="flex items-center justify-between mb-4">
              <div className="text-sm font-medium uppercase tracking-wider text-muted-foreground">Ср. время / шт</div>
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                <Zap className="h-5 w-5" />
              </div>
            </div>
            <div>
              <div className="text-4xl font-bold font-mono">{formatDuration(summary?.avgSecondsPerUnit || 0)}</div>
              <div className="text-sm text-muted-foreground mt-1">В среднем на единицу товара</div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card">
          <CardContent className="p-6 flex flex-col justify-between h-full">
            <div className="flex items-center justify-between mb-4">
              <div className="text-sm font-medium uppercase tracking-wider text-muted-foreground">Выполнение норм</div>
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                <Target className="h-5 w-5" />
              </div>
            </div>
            <div className="flex items-center gap-6">
              <div>
                <div className="text-2xl font-bold text-success flex items-center gap-1">
                  <TrendingUp className="h-5 w-5" /> {summary?.aboveNormCount || 0}
                </div>
                <div className="text-xs text-muted-foreground">В норме</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-destructive flex items-center gap-1">
                  <AlertTriangle className="h-5 w-5" /> {summary?.belowNormCount || 0}
                </div>
                <div className="text-xs text-muted-foreground">С превышением</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Productivity Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Динамика за день (Кол-во операций)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={hourStats || []} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="hour" tickFormatter={(h) => `${h}:00`} stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <Tooltip 
                    cursor={{ fill: 'hsl(var(--muted))' }}
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
                  />
                  <Bar dataKey="operationCount" name="Операций" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Top Products Time */}
        <Card>
          <CardHeader>
            <CardTitle>Ср. время на единицу по товарам (мин)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart 
                  data={(productStats || []).slice(0, 10)} 
                  layout="vertical"
                  margin={{ top: 0, right: 10, left: 20, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
                  <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip 
                    cursor={{ fill: 'hsl(var(--muted))' }}
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
                  />
                  <Bar dataKey="avgSecondsPerUnit" name="Сек/шт" fill="hsl(var(--chart-5))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Product Stats Table */}
      <Card>
        <CardHeader>
          <CardTitle>Сводка по товарам</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead>Товар</TableHead>
                <TableHead className="text-right">Операций</TableHead>
                <TableHead className="text-right">Единиц</TableHead>
                <TableHead className="text-right">Общее время</TableHead>
                <TableHead className="text-right">Ср. время / оп.</TableHead>
                <TableHead className="text-right">Ср. время / шт.</TableHead>
                <TableHead className="text-right">Норма</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {productStats?.length ? (
                productStats.map((stat, i) => (
                  <TableRow key={i}>
                    <TableCell>
                      <div className="font-medium">{stat.name}</div>
                      <div className="font-mono text-xs text-muted-foreground">{stat.barcode}</div>
                    </TableCell>
                    <TableCell className="text-right font-mono">{stat.operationCount}</TableCell>
                    <TableCell className="text-right font-mono font-bold">{stat.totalUnits}</TableCell>
                    <TableCell className="text-right font-mono">{formatDuration(stat.totalNetSeconds)}</TableCell>
                    <TableCell className="text-right font-mono">{formatDuration(stat.avgOperationSeconds)}</TableCell>
                    <TableCell className="text-right font-mono text-primary font-bold">{formatDuration(stat.avgSecondsPerUnit)}</TableCell>
                    <TableCell className="text-right font-mono">
                      {stat.normTimeSeconds ? formatDuration(stat.normTimeSeconds) : "-"}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Нет данных</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
