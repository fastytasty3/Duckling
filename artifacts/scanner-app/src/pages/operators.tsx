import { useState } from "react";
import { 
  useListOperators, useCreateOperator, useUpdateOperator, useDeleteOperator,
  useListShifts, useCreateShift, useUpdateShift, useDeleteShift
} from "@workspace/api-client-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useForm } from "react-hook-form";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Plus, Edit2, Trash2 } from "lucide-react";
import { useFlash } from "@/components/flash-provider";

const operatorSchema = z.object({
  name: z.string().min(1, "Обязательное поле"),
  tabNumber: z.string().optional(),
  department: z.string().optional(),
  workplace: z.string().optional(),
  active: z.boolean().default(true)
});

const shiftSchema = z.object({
  name: z.string().min(1, "Обязательное поле"),
  timeStart: z.string().optional(),
  timeEnd: z.string().optional(),
  active: z.boolean().default(true)
});

export default function Operators() {
  const { data: operators, refetch: refetchOp } = useListOperators();
  const { data: shifts, refetch: refetchShift } = useListShifts();
  
  const createOp = useCreateOperator();
  const updateOp = useUpdateOperator();
  const deleteOp = useDeleteOperator();

  const createSh = useCreateShift();
  const updateSh = useUpdateShift();
  const deleteSh = useDeleteShift();

  const { flash } = useFlash();

  const [opDialogOpen, setOpDialogOpen] = useState(false);
  const [shDialogOpen, setShDialogOpen] = useState(false);
  const [editingOp, setEditingOp] = useState<number | null>(null);
  const [editingSh, setEditingSh] = useState<number | null>(null);

  const formOp = useForm<z.infer<typeof operatorSchema>>({ resolver: zodResolver(operatorSchema) });
  const formSh = useForm<z.infer<typeof shiftSchema>>({ resolver: zodResolver(shiftSchema) });

  const openOpDialog = (op?: any) => {
    if (op) {
      setEditingOp(op.id);
      formOp.reset({ name: op.name, tabNumber: op.tabNumber || "", department: op.department || "", workplace: op.workplace || "", active: op.active });
    } else {
      setEditingOp(null);
      formOp.reset({ name: "", tabNumber: "", department: "", workplace: "", active: true });
    }
    setOpDialogOpen(true);
  };

  const openShDialog = (sh?: any) => {
    if (sh) {
      setEditingSh(sh.id);
      formSh.reset({ name: sh.name, timeStart: sh.timeStart || "", timeEnd: sh.timeEnd || "", active: sh.active });
    } else {
      setEditingSh(null);
      formSh.reset({ name: "", timeStart: "", timeEnd: "", active: true });
    }
    setShDialogOpen(true);
  };

  const submitOp = (v: z.infer<typeof operatorSchema>) => {
    if (editingOp) {
      updateOp.mutate({ id: editingOp, data: v }, { onSuccess: () => { flash("success"); setOpDialogOpen(false); refetchOp(); }});
    } else {
      createOp.mutate({ data: v }, { onSuccess: () => { flash("success"); setOpDialogOpen(false); refetchOp(); }});
    }
  };

  const submitSh = (v: z.infer<typeof shiftSchema>) => {
    if (editingSh) {
      updateSh.mutate({ id: editingSh, data: v }, { onSuccess: () => { flash("success"); setShDialogOpen(false); refetchShift(); }});
    } else {
      createSh.mutate({ data: v }, { onSuccess: () => { flash("success"); setShDialogOpen(false); refetchShift(); }});
    }
  };

  const delOp = (id: number) => { if (confirm("Удалить?")) deleteOp.mutate({ id }, { onSuccess: () => refetchOp() }); };
  const delSh = (id: number) => { if (confirm("Удалить?")) deleteSh.mutate({ id }, { onSuccess: () => refetchShift() }); };

  return (
    <div className="flex-1 p-6 space-y-6 overflow-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Операторы и смены</h1>
      </div>

      <Tabs defaultValue="operators" className="w-full">
        <TabsList className="grid w-[400px] grid-cols-2">
          <TabsTrigger value="operators">Операторы</TabsTrigger>
          <TabsTrigger value="shifts">Смены</TabsTrigger>
        </TabsList>

        <TabsContent value="operators" className="mt-6">
          <Card className="border-border">
            <CardHeader className="flex flex-row items-center justify-between pb-4">
              <CardTitle>Список операторов</CardTitle>
              <Button onClick={() => openOpDialog()}><Plus className="h-4 w-4 mr-2" /> Добавить</Button>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead>ФИО</TableHead>
                    <TableHead>Таб. номер</TableHead>
                    <TableHead>Отдел</TableHead>
                    <TableHead className="text-center">Статус</TableHead>
                    <TableHead className="w-[100px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {operators?.map((op) => (
                    <TableRow key={op.id}>
                      <TableCell className="font-medium">{op.name}</TableCell>
                      <TableCell className="font-mono text-muted-foreground">{op.tabNumber || "-"}</TableCell>
                      <TableCell>{op.department || "-"}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant={op.active ? "default" : "secondary"}>{op.active ? "Активен" : "Неактивен"}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-2">
                          <Button variant="ghost" size="icon" onClick={() => openOpDialog(op)}><Edit2 className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10" onClick={() => delOp(op.id)}><Trash2 className="h-4 w-4" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="shifts" className="mt-6">
          <Card className="border-border">
            <CardHeader className="flex flex-row items-center justify-between pb-4">
              <CardTitle>Список смен</CardTitle>
              <Button onClick={() => openShDialog()}><Plus className="h-4 w-4 mr-2" /> Добавить</Button>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead>Название</TableHead>
                    <TableHead>Время начала</TableHead>
                    <TableHead>Время окончания</TableHead>
                    <TableHead className="text-center">Статус</TableHead>
                    <TableHead className="w-[100px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shifts?.map((sh) => (
                    <TableRow key={sh.id}>
                      <TableCell className="font-medium">{sh.name}</TableCell>
                      <TableCell className="font-mono text-muted-foreground">{sh.timeStart || "-"}</TableCell>
                      <TableCell className="font-mono text-muted-foreground">{sh.timeEnd || "-"}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant={sh.active ? "default" : "secondary"}>{sh.active ? "Активна" : "Неактивна"}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-2">
                          <Button variant="ghost" size="icon" onClick={() => openShDialog(sh)}><Edit2 className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10" onClick={() => delSh(sh.id)}><Trash2 className="h-4 w-4" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Operator Dialog */}
      <Dialog open={opDialogOpen} onOpenChange={setOpDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingOp ? "Редактировать" : "Новый оператор"}</DialogTitle></DialogHeader>
          <Form {...formOp}>
            <form onSubmit={formOp.handleSubmit(submitOp)} className="space-y-4">
              <FormField control={formOp.control} name="name" render={({ field }) => (
                <FormItem><FormLabel>ФИО *</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={formOp.control} name="tabNumber" render={({ field }) => (
                <FormItem><FormLabel>Табельный номер</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={formOp.control} name="department" render={({ field }) => (
                <FormItem><FormLabel>Отдел</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <DialogFooter><Button type="submit">Сохранить</Button></DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Shift Dialog */}
      <Dialog open={shDialogOpen} onOpenChange={setShDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingSh ? "Редактировать" : "Новая смена"}</DialogTitle></DialogHeader>
          <Form {...formSh}>
            <form onSubmit={formSh.handleSubmit(submitSh)} className="space-y-4">
              <FormField control={formSh.control} name="name" render={({ field }) => (
                <FormItem><FormLabel>Название *</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <div className="grid grid-cols-2 gap-4">
                <FormField control={formSh.control} name="timeStart" render={({ field }) => (
                  <FormItem><FormLabel>Начало (HH:mm)</FormLabel><FormControl><Input {...field} placeholder="08:00" /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={formSh.control} name="timeEnd" render={({ field }) => (
                  <FormItem><FormLabel>Окончание (HH:mm)</FormLabel><FormControl><Input {...field} placeholder="20:00" /></FormControl><FormMessage /></FormItem>
                )} />
              </div>
              <DialogFooter><Button type="submit">Сохранить</Button></DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
