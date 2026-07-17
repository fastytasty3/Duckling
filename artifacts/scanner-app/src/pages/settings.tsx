import { useEffect } from "react";
import { useGetSettings, useUpdateSettings } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useForm } from "react-hook-form";
import { Form, FormControl, FormField, FormItem, FormLabel, FormDescription } from "@/components/ui/form";
import { useFlash } from "@/components/flash-provider";

export default function Settings() {
  const { data: settings, isLoading } = useGetSettings();
  const updateSettings = useUpdateSettings();
  const { flash } = useFlash();

  const form = useForm({
    defaultValues: {
      scanMode: "increment_quantity",
      minBarcodeLength: 4,
      duplicateScanDebounceMs: 500,
      soundEnabled: true,
      autoStopMinutes: 0,
      warningMinutes: 0,
      defaultNormTimeSeconds: 0
    }
  });

  useEffect(() => {
    if (settings) {
      form.reset({
        scanMode: settings.scanMode || "increment_quantity",
        minBarcodeLength: settings.minBarcodeLength || 4,
        duplicateScanDebounceMs: settings.duplicateScanDebounceMs || 500,
        soundEnabled: settings.soundEnabled ?? true,
        autoStopMinutes: settings.autoStopMinutes || 0,
        warningMinutes: settings.warningMinutes || 0,
        defaultNormTimeSeconds: settings.defaultNormTimeSeconds || 0
      });
    }
  }, [settings, form]);

  const onSubmit = (values: any) => {
    const payload = {
      ...values,
      minBarcodeLength: Number(values.minBarcodeLength),
      duplicateScanDebounceMs: Number(values.duplicateScanDebounceMs),
      autoStopMinutes: values.autoStopMinutes ? Number(values.autoStopMinutes) : undefined,
      warningMinutes: values.warningMinutes ? Number(values.warningMinutes) : undefined,
      defaultNormTimeSeconds: values.defaultNormTimeSeconds ? Number(values.defaultNormTimeSeconds) : undefined,
    };

    updateSettings.mutate({ data: payload }, {
      onSuccess: () => {
        flash("success");
      },
      onError: () => {
        flash("error");
      }
    });
  };

  if (isLoading) return null;

  return (
    <div className="flex-1 p-6 max-w-4xl mx-auto space-y-6 w-full">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Настройки системы</h1>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          
          <Card className="border-border">
            <CardHeader>
              <CardTitle className="text-lg">Режим сканирования</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <FormField control={form.control} name="scanMode" render={({ field }) => (
                <FormItem>
                  <FormLabel>Действие при сканировании</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Выберите режим" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="increment_quantity">Добавлять количество к текущей операции</SelectItem>
                      <SelectItem value="new_operation">Создавать новую операцию (автостоп текущей)</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormDescription>Определяет, что происходит при сканировании штрихкода во время активной операции.</FormDescription>
                </FormItem>
              )} />

              <div className="grid grid-cols-2 gap-6">
                <FormField control={form.control} name="minBarcodeLength" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Минимальная длина штрихкода</FormLabel>
                    <FormControl><Input type="number" {...field} /></FormControl>
                    <FormDescription>Символов (по умолчанию 4)</FormDescription>
                  </FormItem>
                )} />

                <FormField control={form.control} name="duplicateScanDebounceMs" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Защита от двойного сканирования (мс)</FormLabel>
                    <FormControl><Input type="number" {...field} /></FormControl>
                    <FormDescription>Интервал игнорирования одинаковых штрихкодов</FormDescription>
                  </FormItem>
                )} />
              </div>
            </CardContent>
          </Card>

          <Card className="border-border">
            <CardHeader>
              <CardTitle className="text-lg">Таймеры и нормативы</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <FormField control={form.control} name="autoStopMinutes" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Автостоп операции (мин)</FormLabel>
                    <FormControl><Input type="number" {...field} /></FormControl>
                    <FormDescription>0 — отключено. Если сканирований нет дольше этого времени, операция ставится на паузу.</FormDescription>
                  </FormItem>
                )} />

                <FormField control={form.control} name="defaultNormTimeSeconds" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Норма времени по умолчанию (сек)</FormLabel>
                    <FormControl><Input type="number" {...field} /></FormControl>
                    <FormDescription>Применяется, если у товара не задана своя норма</FormDescription>
                  </FormItem>
                )} />
              </div>
            </CardContent>
          </Card>

          <Card className="border-border">
            <CardHeader>
              <CardTitle className="text-lg">Интерфейс</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <FormField control={form.control} name="soundEnabled" render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border border-border p-4 bg-muted/20">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">Звуковые уведомления</FormLabel>
                    <FormDescription>Звук при успешном или ошибочном сканировании</FormDescription>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )} />
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button type="submit" size="lg" className="h-12 px-8 text-lg font-bold tracking-wide uppercase" disabled={updateSettings.isPending}>
              Сохранить настройки
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
