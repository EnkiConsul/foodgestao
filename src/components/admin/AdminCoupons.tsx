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
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">Cupons de desconto para checkout.</p>
        <Button onClick={() => { setForm(DEFAULTS); setOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" /> Novo cupom
        </Button>
      </div>

      <div className="rounded-md border">
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
                    {c.valid_until ? format(new Date(c.valid_until), "dd/MM/yy", { locale: ptBR }) : "—"}
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
