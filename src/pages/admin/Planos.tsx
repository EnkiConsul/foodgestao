import { useState } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import {
  usePlans, usePlanAddons, useUpsertPlan, useDeletePlan, useUpsertAddon, useDeleteAddon,
  useSubscriptionPlanCounts, MODULE_LABELS, type PlanModule,
} from "@/hooks/usePlans";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCents } from "@/lib/billing";
import { Pencil, Plus, Trash2 } from "lucide-react";

const LIMITS: { key: string; label: string; modules: PlanModule[] }[] = [
  { key: "max_collaborators", label: "Colaboradores", modules: ["pessoas"] },
  { key: "max_units", label: "Unidades", modules: ["pessoas"] },
  { key: "max_companies", label: "Empresas", modules: ["pessoas", "financeiro"] },
  { key: "max_companies_ceiling", label: "Teto de empresas (com adicionais)", modules: ["financeiro"] },
  { key: "max_users", label: "Usuários administradores", modules: ["pessoas", "financeiro"] },
  { key: "max_open_finance", label: "Conexões Open Finance", modules: ["financeiro"] },
  { key: "accountant_seats", label: "Contadores gratuitos", modules: ["pessoas", "financeiro"] },
];

const toReais = (c: number) => (Number(c ?? 0) / 100).toFixed(2).replace(".", ",");
const toCents = (s: string) => Math.round(Number(String(s).replace(/\./g, "").replace(",", ".")) * 100) || 0;

function PlanDialog({ plan, module, onClose }: { plan: any | null; module: PlanModule; onClose: () => void }) {
  const upsert = useUpsertPlan();
  const [f, setF] = useState<any>(() =>
    plan ?? {
      module, name: "", slug: "", description: "", price_cents: 0, billing_period: "monthly",
      trial_days: 7, annual_discount_pct: module === "pessoas" ? 15 : 20, is_active: true, is_public: true,
      is_enterprise: false, is_featured: false, featured_label: module === "pessoas" ? "Mais Recomendado" : "Mais Escolhido",
      sort_order: 10, features: {},
    },
  );
  const [price, setPrice] = useState(toReais(f.price_cents));
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));
  const setLimit = (k: string, v: string) =>
    setF((p: any) => {
      const features = { ...(p.features ?? {}) };
      if (v === "") delete features[k]; else features[k] = Number(v);
      return { ...p, features };
    });

  const save = () => {
    if (!f.name.trim() || !f.slug.trim()) return;
    upsert.mutate({ ...f, price_cents: toCents(price), slug: f.slug.trim().toLowerCase() }, { onSuccess: onClose });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{plan ? "Editar plano" : "Novo plano"} — {MODULE_LABELS[f.module as PlanModule]}</DialogTitle></DialogHeader>
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="space-y-1.5"><Label>Nome *</Label><Input value={f.name} onChange={(e) => set("name", e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Identificador *</Label><Input value={f.slug} onChange={(e) => set("slug", e.target.value)} placeholder="pessoas-gestao" /></div>
          <div className="space-y-1.5 sm:col-span-2"><Label>Descrição</Label><Textarea value={f.description ?? ""} onChange={(e) => set("description", e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Preço mensal (R$)</Label><Input value={price} onChange={(e) => setPrice(e.target.value)} disabled={f.is_enterprise} /></div>
          <div className="space-y-1.5"><Label>Desconto anual (%)</Label><Input type="number" value={f.annual_discount_pct} onChange={(e) => set("annual_discount_pct", Number(e.target.value))} /></div>
          <div className="space-y-1.5"><Label>Dias de teste</Label><Input type="number" value={f.trial_days} onChange={(e) => set("trial_days", Number(e.target.value))} /></div>
          <div className="space-y-1.5"><Label>Ordem</Label><Input type="number" value={f.sort_order} onChange={(e) => set("sort_order", Number(e.target.value))} /></div>
        </div>
        <div className="space-y-2 pt-2">
          <p className="text-sm font-medium">Limites (vazio = ilimitado)</p>
          <div className="grid sm:grid-cols-2 gap-3">
            {LIMITS.filter((l) => l.modules.includes(f.module)).map((l) => (
              <div key={l.key} className="space-y-1.5">
                <Label>{l.label}</Label>
                <Input type="number" value={f.features?.[l.key] ?? ""} onChange={(e) => setLimit(l.key, e.target.value)} />
              </div>
            ))}
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-3 pt-2">
          {[["is_active", "Ativo"], ["is_public", "Visível para venda"], ["is_enterprise", "Enterprise (sob consulta)"], ["is_featured", "Destaque"]].map(([k, l]) => (
            <label key={k} className="flex items-center justify-between rounded-md border p-2 text-sm">
              {l}<Switch checked={!!f[k]} onCheckedChange={(v) => set(k, v)} />
            </label>
          ))}
          {f.is_featured && (
            <div className="space-y-1.5 sm:col-span-2"><Label>Texto do selo</Label><Input value={f.featured_label} onChange={(e) => set("featured_label", e.target.value)} /></div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} disabled={upsert.isPending}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddonDialog({ addon, module, plans, onClose }: { addon: any | null; module: PlanModule; plans: any[]; onClose: () => void }) {
  const upsert = useUpsertAddon();
  const [f, setF] = useState<any>(() => addon ?? { module, code: "", name: "", description: "", price_cents: 0, allowed_plan_slugs: null, max_quantity: null, is_active: true, sort_order: 10 });
  const [price, setPrice] = useState(toReais(f.price_cents));
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));
  const modPlans = plans.filter((p) => p.module === f.module);
  const toggleSlug = (slug: string) => {
    const cur: string[] = f.allowed_plan_slugs ?? [];
    const next = cur.includes(slug) ? cur.filter((s) => s !== slug) : [...cur, slug];
    set("allowed_plan_slugs", next.length ? next : null);
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{addon ? "Editar adicional" : "Novo adicional"}</DialogTitle></DialogHeader>
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="space-y-1.5"><Label>Nome *</Label><Input value={f.name} onChange={(e) => set("name", e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Código *</Label><Input value={f.code} onChange={(e) => set("code", e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Preço mensal (R$)</Label><Input value={price} onChange={(e) => setPrice(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Quantidade máxima</Label><Input type="number" value={f.max_quantity ?? ""} onChange={(e) => set("max_quantity", e.target.value === "" ? null : Number(e.target.value))} /></div>
        </div>
        <div className="space-y-1.5">
          <Label>Disponível nos planos (nenhum marcado = todos)</Label>
          <div className="flex flex-wrap gap-2">
            {modPlans.map((p) => (
              <Button key={p.id} type="button" size="sm" variant={(f.allowed_plan_slugs ?? []).includes(p.slug) ? "default" : "outline"} onClick={() => toggleSlug(p.slug)}>{p.name}</Button>
            ))}
          </div>
        </div>
        <label className="flex items-center justify-between rounded-md border p-2 text-sm">Ativo<Switch checked={f.is_active} onCheckedChange={(v) => set("is_active", v)} /></label>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button disabled={upsert.isPending || !f.name.trim() || !f.code.trim()} onClick={() => upsert.mutate({ ...f, price_cents: toCents(price) }, { onSuccess: onClose })}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function AdminPlanos() {
  const { data: plans = [] } = usePlans();
  const { data: addons = [] } = usePlanAddons();
  const { data: counts = {} } = useSubscriptionPlanCounts();
  const delPlan = useDeletePlan();
  const delAddon = useDeleteAddon();
  const upsertPlan = useUpsertPlan();
  const [mod, setMod] = useState<PlanModule>("pessoas");
  const [editPlan, setEditPlan] = useState<any | null | undefined>(undefined);
  const [editAddon, setEditAddon] = useState<any | null | undefined>(undefined);

  return (
    <div className="space-y-6">
      <AdminPageHeader title="Planos e Preços" description="Catálogo de planos e adicionais por módulo" />
      <Tabs value={mod} onValueChange={(v) => setMod(v as PlanModule)}>
        <TabsList>
          <TabsTrigger value="pessoas">Pessoas 360°</TabsTrigger>
          <TabsTrigger value="financeiro">Financeiro 360°</TabsTrigger>
        </TabsList>
        {(["pessoas", "financeiro"] as PlanModule[]).map((m) => (
          <TabsContent key={m} value={m} className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="font-semibold">Planos</h2>
              <Button size="sm" onClick={() => setEditPlan(null)}><Plus className="h-4 w-4 mr-1" />Novo plano</Button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {plans.filter((p) => p.module === m).map((p) => {
                const n = counts[p.id] ?? 0;
                const annual = Math.round(p.price_cents * (1 - Number(p.annual_discount_pct) / 100));
                return (
                  <Card key={p.id} className={p.is_featured ? "border-primary" : ""}>
                    <CardHeader className="pb-2">
                      <div className="flex flex-wrap gap-1">
                        {p.is_featured && <Badge>{p.featured_label}</Badge>}
                        {!p.is_active && <Badge variant="outline">Inativo</Badge>}
                        {!p.is_public && <Badge variant="outline">Oculto</Badge>}
                      </div>
                      <CardTitle className="text-base">{p.name}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      {p.is_enterprise ? <p className="text-xl font-bold">Sob consulta</p> : (
                        <>
                          <p className="text-xl font-bold">{formatCents(p.price_cents)}<span className="text-xs font-normal text-muted-foreground">/mês</span></p>
                          <p className="text-xs text-muted-foreground">Anual: {formatCents(annual)}/mês ({p.annual_discount_pct}% off)</p>
                        </>
                      )}
                      <ul className="text-xs text-muted-foreground space-y-0.5">
                        {LIMITS.filter((l) => p.features?.[l.key] != null).map((l) => (
                          <li key={l.key}>{l.label}: {p.features[l.key]}</li>
                        ))}
                        <li>Teste: {p.trial_days} dias</li>
                      </ul>
                      <p className="text-xs">{n} assinatura(s)</p>
                      <div className="flex gap-1 pt-1">
                        <Button size="sm" variant="outline" onClick={() => setEditPlan(p)}><Pencil className="h-3.5 w-3.5" /></Button>
                        {n > 0 ? (
                          p.is_active && (
                            <Button size="sm" variant="ghost" onClick={() => confirm(`Desativar ${p.name}? As ${n} assinaturas continuam.`) && upsertPlan.mutate({ id: p.id, is_active: false, is_public: false })}>Desativar</Button>
                          )
                        ) : (
                          <Button size="sm" variant="ghost" onClick={() => confirm(`Excluir ${p.name}?`) && delPlan.mutate(p.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            <div className="flex justify-between items-center">
              <h2 className="font-semibold">Adicionais</h2>
              <Button size="sm" variant="outline" onClick={() => setEditAddon(null)}><Plus className="h-4 w-4 mr-1" />Novo adicional</Button>
            </div>
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader><TableRow><TableHead>Adicional</TableHead><TableHead>Preço/mês</TableHead><TableHead>Planos</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader>
                <TableBody>
                  {addons.filter((a) => a.module === m).map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium">{a.name}</TableCell>
                      <TableCell>{formatCents(a.price_cents)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{a.allowed_plan_slugs?.length ? a.allowed_plan_slugs.map((s: string) => plans.find((p) => p.slug === s)?.name ?? s).join(", ") : "Todos"}</TableCell>
                      <TableCell>{a.is_active ? <Badge variant="secondary">Ativo</Badge> : <Badge variant="outline">Inativo</Badge>}</TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        <Button size="sm" variant="ghost" onClick={() => setEditAddon(a)}><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => confirm(`Excluir ${a.name}?`) && delAddon.mutate(a.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        ))}
      </Tabs>
      {editPlan !== undefined && <PlanDialog plan={editPlan} module={mod} onClose={() => setEditPlan(undefined)} />}
      {editAddon !== undefined && <AddonDialog addon={editAddon} module={mod} plans={plans} onClose={() => setEditAddon(undefined)} />}
    </div>
  );
}
