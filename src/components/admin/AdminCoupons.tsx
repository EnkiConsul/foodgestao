import { useEffect, useState } from "react";
import { useCoupons, useUpsertCoupon, useDeleteCoupon } from "@/hooks/useCoupons";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { formatDate } from "@/lib/date-utils";

const DEFAULTS = {
  code: "",
  description: "",
  discount_type: "percent",
  discount_value: 10,
  max_redemptions: null,
  valid_from: null,
  valid_until: null,
  is_active: true,
};

export function AdminCoupons() {
  const { data: coupons = [], isLoading } = useCoupons();
  const upsert = useUpsertCoupon();
  const del = useDeleteCoupon();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>(DEFAULTS);

  useEffect(() => { if (!open) setForm(DEFAULTS); }, [open]);

  const setF = (k: string, v: any) => setForm((s: any) => ({ ...s, [k]: v }));

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
        <p className="text-sm text-muted-foreground">Cupons de desconto para checkout.</p>
        <Button onClick={() => { setForm(DEFAULTS); setOpen(true); }} className="w-full sm:w-auto min-h-10">
          <Plus className="h-4 w-4 mr-2" /> Novo cupom
        </Button>
      </div>

      {/* Desktop */}
      <div className="hidden md:block rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Código</TableHead>
              <TableHead>Desconto</TableHead>
              <TableHead>Usos</TableHead>
              <TableHead>Validade</TableHead>
              <TableHead>Status</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={6}>Carregando...</TableCell></TableRow>
            ) : coupons.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Nenhum cupom</TableCell></TableRow>
            ) : (
              coupons.map((c: any) => (
                <TableRow key={c.id}>
                  <TableCell className="font-mono font-medium">{c.code}</TableCell>
                  <TableCell>
                    {c.discount_type === "percent"
                      ? `${c.discount_value}%`
                      : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(c.discount_value)}
                  </TableCell>
                  <TableCell>{c.times_redeemed}{c.max_redemptions ? `/${c.max_redemptions}` : ""}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatDate(c.valid_until, "dd/MM/yy")}
                  </TableCell>
                  <TableCell>
                    <Badge variant={c.is_active ? "default" : "outline"}>{c.is_active ? "Ativo" : "Inativo"}</Badge>
                  </TableCell>
                  <TableCell className="flex gap-1">
                    <Button size="icon" variant="ghost" onClick={() => { setForm(c); setOpen(true); }}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => del.mutate(c.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Mobile */}
      <div className="md:hidden space-y-2">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : coupons.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-8">Nenhum cupom</p>
        ) : (
          coupons.map((c: any) => (
            <div key={c.id} className="rounded-md border p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-mono font-semibold truncate">{c.code}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {c.discount_type === "percent"
                      ? `${c.discount_value}% de desconto`
                      : `${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(c.discount_value)} de desconto`}
                  </p>
                </div>
                <Badge variant={c.is_active ? "default" : "outline"} className="shrink-0 text-[10px]">
                  {c.is_active ? "Ativo" : "Inativo"}
                </Badge>
              </div>
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>Usos: {c.times_redeemed}{c.max_redemptions ? `/${c.max_redemptions}` : ""}</span>
                <span>Até {formatDate(c.valid_until, "dd/MM/yy")}</span>
              </div>
              <div className="flex gap-1 pt-1 border-t">
                <Button size="sm" variant="outline" className="flex-1 min-h-9" onClick={() => { setForm(c); setOpen(true); }}>
                  <Pencil className="h-4 w-4 mr-1" /> Editar
                </Button>
                <Button size="sm" variant="outline" className="flex-1 min-h-9" onClick={() => del.mutate(c.id)}>
                  <Trash2 className="h-4 w-4 mr-1" /> Excluir
                </Button>
              </div>
            </div>
          ))
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form.id ? "Editar cupom" : "Novo cupom"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label>Código</Label>
              <Input value={form.code} onChange={(e) => setF("code", e.target.value.toUpperCase())} />
            </div>
            <div className="col-span-2">
              <Label>Descrição</Label>
              <Input value={form.description ?? ""} onChange={(e) => setF("description", e.target.value)} />
            </div>
            <div>
              <Label>Tipo</Label>
              <Select value={form.discount_type} onValueChange={(v) => setF("discount_type", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="percent">Percentual</SelectItem>
                  <SelectItem value="fixed">Valor fixo (R$)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Valor</Label>
              <Input type="number" step="0.01" value={form.discount_value}
                onChange={(e) => setF("discount_value", parseFloat(e.target.value || "0"))} />
            </div>
            <div>
              <Label>Limite de usos</Label>
              <Input type="number" value={form.max_redemptions ?? ""}
                onChange={(e) => setF("max_redemptions", e.target.value ? parseInt(e.target.value) : null)} />
            </div>
            <div>
              <Label>Válido até</Label>
              <Input type="date" value={form.valid_until ? form.valid_until.slice(0, 10) : ""}
                onChange={(e) => setF("valid_until", e.target.value ? new Date(e.target.value).toISOString() : null)} />
            </div>
            <div className="col-span-2 flex items-center justify-between rounded-md border p-3">
              <Label>Ativo</Label>
              <Switch checked={form.is_active} onCheckedChange={(v) => setF("is_active", v)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => upsert.mutate(form, { onSuccess: () => setOpen(false) })}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
