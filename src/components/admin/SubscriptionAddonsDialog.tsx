import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { notifyError } from "@/lib/notifyError";

const brl = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  subscription: { id: string; module: string | null; planSlug?: string | null; companyName?: string } | null;
}

export function SubscriptionAddonsDialog({ open, onOpenChange, subscription }: Props) {
  const qc = useQueryClient();
  const subId = subscription?.id;
  const module = subscription?.module ?? "financeiro";
  const [addonId, setAddonId] = useState("");
  const [qty, setQty] = useState(1);
  const [exempt, setExempt] = useState(false);
  const [notes, setNotes] = useState("");

  const catalog = useQuery({
    queryKey: ["plan-addons", module],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase.from("plan_addons").select("*").eq("module", module).eq("is_active", true).order("sort_order");
      if (error) throw error;
      return data as any[];
    },
  });

  const items = useQuery({
    queryKey: ["subscription-addons", subId],
    enabled: open && !!subId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("subscription_addons")
        .select("*, addon:plan_addons(name, code)")
        .eq("subscription_id", subId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["subscription-addons", subId] });
    qc.invalidateQueries({ queryKey: ["admin-subscriptions"] });
  };

  const add = useMutation({
    mutationFn: async () => {
      const a = catalog.data?.find((x) => x.id === addonId);
      if (!a || !subId) throw new Error("Selecione um adicional");
      if (qty < 1 || (a.max_quantity && qty > a.max_quantity)) throw new Error(`Quantidade inválida (máx. ${a.max_quantity ?? "—"})`);
      const { data: u } = await supabase.auth.getUser();
      const { error } = await (supabase as any).from("subscription_addons").insert({
        subscription_id: subId, addon_id: a.id, quantity: qty,
        price_cents: exempt ? 0 : a.price_cents, is_exempt: exempt,
        notes: notes.trim() || null, created_by: u.user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Adicional incluído"); setAddonId(""); setQty(1); setExempt(false); setNotes(""); refresh(); },
    onError: (e: any) => notifyError(e, { surface: "Sistema", action: "incluir adicional", fallback: "Erro ao incluir adicional" }),
  });

  const patch = useMutation({
    mutationFn: async ({ id, ...p }: any) => {
      const { error } = await (supabase as any).from("subscription_addons").update(p).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Adicional atualizado"); refresh(); },
    onError: (e: any) => notifyError(e, { surface: "Sistema", action: "atualizar adicional", fallback: "Erro ao atualizar" }),
  });

  const selected = catalog.data?.find((x) => x.id === addonId);
  const allowed = (a: any) => !a.allowed_plan_slugs?.length || !subscription?.planSlug || a.allowed_plan_slugs.includes(subscription.planSlug);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Contratações Adicionais</DialogTitle>
          <DialogDescription>{subscription?.companyName ?? "Empresa"} · {module === "pessoas" ? "Pessoas 360°" : "Financeiro 360°"}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 rounded-md border p-3">
          <div className="grid gap-2 sm:grid-cols-[1fr_100px]">
            <Select value={addonId} onValueChange={setAddonId}>
              <SelectTrigger><SelectValue placeholder="Escolha o adicional" /></SelectTrigger>
              <SelectContent>
                {(catalog.data ?? []).map((a) => (
                  <SelectItem key={a.id} value={a.id} disabled={!allowed(a)}>
                    {a.name} · {brl(a.price_cents)}/mês{!allowed(a) ? " (não disponível neste plano)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input type="number" min={1} max={selected?.max_quantity ?? undefined} value={qty} onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))} />
          </div>
          <Input placeholder="Observação (opcional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Checkbox id="addon-exempt" checked={exempt} onCheckedChange={(v) => setExempt(!!v)} />
              <Label htmlFor="addon-exempt">Cortesia (isento)</Label>
            </div>
            <span className="text-sm text-muted-foreground">
              Total: {selected ? brl((exempt ? 0 : selected.price_cents) * qty) : "—"}/mês
            </span>
            <Button onClick={() => add.mutate()} disabled={!addonId || add.isPending}>Incluir</Button>
          </div>
        </div>

        <div className="space-y-2">
          {(items.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Nenhum adicional contratado</p>
          ) : (
            items.data!.map((it) => (
              <div key={it.id} className="flex flex-wrap items-center gap-2 rounded-md border p-2 text-sm">
                <div className="flex-1 min-w-[160px]">
                  <p className="font-medium">{it.addon?.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {it.is_exempt ? "Cortesia" : `${brl(it.price_cents)} × ${it.quantity} = ${brl(it.price_cents * it.quantity)}/mês`}
                    {it.notes ? ` · ${it.notes}` : ""}
                  </p>
                  {!it.is_exempt && !it.prorata_billed_at && Number(it.prorata_cents ?? 0) > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {brl(it.prorata_cents)} proporcional aos dias restantes, cobrado na próxima fatura
                    </p>
                  )}
                </div>
                <Badge variant={it.status === "active" ? "default" : "secondary"}>{it.status === "active" ? "Ativo" : "Cancelado"}</Badge>
                {it.status === "active" && (
                  <>
                    <Input type="number" min={1} defaultValue={it.quantity} className="h-8 w-20"
                      onBlur={(e) => { const q = Number(e.target.value); if (q >= 1 && q !== it.quantity) patch.mutate({ id: it.id, quantity: q }); }} />
                    <Button size="sm" variant="ghost" onClick={() => patch.mutate({ id: it.id, is_exempt: !it.is_exempt })}>
                      {it.is_exempt ? "Cobrar" : "Isentar"}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => confirm("Cancelar este adicional?") && patch.mutate({ id: it.id, status: "canceled" })}>
                      Cancelar
                    </Button>
                  </>
                )}
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
