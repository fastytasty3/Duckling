import { useState } from "react";
import { 
  useListProducts,
  useCreateProduct,
  useUpdateProduct,
  useDeleteProduct
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useForm } from "react-hook-form";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Search, Plus, Edit2, Trash2, FileUp } from "lucide-react";
import { useFlash } from "@/components/flash-provider";
import { formatDuration } from "@/lib/date-utils";
import { useQueryClient } from "@tanstack/react-query";

const productSchema = z.object({
  barcode: z.string().min(1, "Обязательное поле"),
  sku: z.string().optional(),
  name: z.string().min(1, "Обязательное поле"),
  category: z.string().optional(),
  normTimeSeconds: z.coerce.number().optional(),
  active: z.boolean().default(true)
});

type ProductFormValues = z.infer<typeof productSchema>;

export default function Products() {
  const [search, setSearch] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  
  const { data: products, refetch } = useListProducts({ search });
  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const deleteProduct = useDeleteProduct();
  const { flash } = useFlash();

  const form = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      barcode: "",
      name: "",
      sku: "",
      category: "",
      normTimeSeconds: 0,
      active: true
    }
  });

  const handleOpenDialog = (product?: any) => {
    if (product) {
      setEditingId(product.id);
      form.reset({
        barcode: product.barcode,
        name: product.name,
        sku: product.sku || "",
        category: product.category || "",
        normTimeSeconds: product.normTimeSeconds || 0,
        active: product.active
      });
    } else {
      setEditingId(null);
      form.reset({
        barcode: "",
        name: "",
        sku: "",
        category: "",
        normTimeSeconds: 0,
        active: true
      });
    }
    setIsDialogOpen(true);
  };

  const onSubmit = (values: ProductFormValues) => {
    const payload = {
      ...values,
      normTimeSeconds: values.normTimeSeconds ? Number(values.normTimeSeconds) : undefined
    };

    if (editingId) {
      updateProduct.mutate(
        { id: editingId, data: payload },
        {
          onSuccess: () => {
            flash("success");
            setIsDialogOpen(false);
            refetch();
          }
        }
      );
    } else {
      createProduct.mutate(
        { data: payload },
        {
          onSuccess: () => {
            flash("success");
            setIsDialogOpen(false);
            refetch();
          }
        }
      );
    }
  };

  const handleDelete = (id: number) => {
    if (confirm("Удалить товар?")) {
      deleteProduct.mutate({ id }, { onSuccess: () => refetch() });
    }
  };

  return (
    <div className="flex-1 p-6 space-y-6 overflow-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Справочник товаров</h1>
        <div className="flex items-center gap-3">
          <Button variant="outline"><FileUp className="mr-2 h-4 w-4" /> Импорт CSV</Button>
          <Button onClick={() => handleOpenDialog()}><Plus className="mr-2 h-4 w-4" /> Добавить товар</Button>
        </div>
      </div>

      <Card className="border-border">
        <CardHeader className="pb-4">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Поиск по штрихкоду, SKU или названию..." 
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead>Штрихкод / SKU</TableHead>
                <TableHead>Название</TableHead>
                <TableHead>Категория</TableHead>
                <TableHead className="text-right">Норма времени</TableHead>
                <TableHead className="text-center">Статус</TableHead>
                <TableHead className="w-[100px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products?.length ? (
                products.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <div className="font-mono font-medium">{p.barcode}</div>
                      {p.sku && <div className="font-mono text-xs text-muted-foreground">{p.sku}</div>}
                    </TableCell>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell className="text-muted-foreground">{p.category || "-"}</TableCell>
                    <TableCell className="text-right font-mono">
                      {p.normTimeSeconds ? formatDuration(p.normTimeSeconds) : "-"}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant={p.active ? "default" : "secondary"}>
                        {p.active ? "Активен" : "Неактивен"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-2">
                        <Button variant="ghost" size="icon" onClick={() => handleOpenDialog(p)}>
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => handleDelete(p.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Товары не найдены</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? "Редактировать товар" : "Новый товар"}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField control={form.control} name="barcode" render={({ field }) => (
                <FormItem>
                  <FormLabel>Штрихкод *</FormLabel>
                  <FormControl><Input {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="sku" render={({ field }) => (
                <FormItem>
                  <FormLabel>Артикул (SKU)</FormLabel>
                  <FormControl><Input {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="name" render={({ field }) => (
                <FormItem>
                  <FormLabel>Наименование *</FormLabel>
                  <FormControl><Input {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="category" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Категория</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="normTimeSeconds" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Норма времени (сек)</FormLabel>
                    <FormControl><Input type="number" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <DialogFooter className="pt-4">
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>Отмена</Button>
                <Button type="submit" disabled={createProduct.isPending || updateProduct.isPending}>
                  Сохранить
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
