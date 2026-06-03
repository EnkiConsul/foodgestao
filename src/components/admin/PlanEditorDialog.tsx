import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const DEFAULT_PLAN = {
  slug: "",
  name: "",
  description: "",
  price_cents: 0,
  billing_period: "monthly",
  trial_days: 0,
  is_active: true,
  is_public: true,
  is_featured: false,
  featured_label: "Mais popular",
  sort_order: 0,
  features: {
    max_companies: 1,
    included_companies: 1,
    price_per_extra_company_cents: 0,
    max_transactions_per_month: 50,
    max_users_per_company: 1,
    max_attachments_per_transaction: 1,
    ai_enabled: false,
    reports_advanced: false,
    export_pdf: false,
    export_csv: true,
    support: "community",
  },
};

export function PlanEditorDialog({
  open, onOpenChange, plan, onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  plan: any | null;
  onSave: (data: any) => void;
}) {
  const [form, setForm] = useState<any>(DEFAULT_PLAN);
  const [priceReais, setPriceReais] = useState("0");

  useEffect(() => {
    if (plan) {
      setForm({ ...plan, features: { ...DEFAULT_PLAN.features, ...(plan.features || {}) } });
      setPriceReais(((plan.price_cents ?? 0) / 100).toFixed(2));
    } else {
      setForm(DEFAULT_PLAN);
      setPriceReais("0");
    }
  }, [plan, open]);

  const setF = (k: string, v: any) => setForm((s: any) => ({ ...s, [k]: v }));
  const setFeat = (k: string, v: any) =>
    setForm((s: any) => ({ ...s, features: { ...s.features, [k]: v } }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{plan ? "Editar plano" : "Novo plano"}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label>Slug</Label>
            <Input value={form.slug} onChange={(e) => setF("slug", e.target.value)} placeholder="pro" />
          </div>
          <div>
            <Label>Nome</Label>
            <Input value={form.name} onChange={(e) => setF("name", e.target.value)} placeholder="Pro" />
          </div>
          <div className="col-span-2">
            <Label>Descrição</Label>
            <Textarea value={form.description ?? ""} onChange={(e) => setF("description", e.target.value)} rows={2} />
          </div>
          <div>
            <Label>Preço (R$)</Label>
            <Input
              type="number"
              step="0.01"
              value={priceReais}
              onChange={(e) => {
                setPriceReais(e.target.value);
                setF("price_cents", Math.round(parseFloat(e.target.value || "0") * 100));
              }}
            />
          </div>
          <div>
            <Label>Período</Label>
            <Select value={form.billing_period} onValueChange={(v) => setF("billing_period", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">Mensal</SelectItem>
                <SelectItem value="yearly">Anual</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Trial (dias)</Label>
            <Input type="number" value={form.trial_days} onChange={(e) => setF("trial_days", parseInt(e.target.value || "0"))} />
          </div>
          <div>
            <Label>Ordem</Label>
            <Input type="number" value={form.sort_order} onChange={(e) => setF("sort_order", parseInt(e.target.value || "0"))} />
          </div>
          <div className="flex items-center justify-between rounded-md border p-3">
            <Label>Ativo</Label>
            <Switch checked={form.is_active} onCheckedChange={(v) => setF("is_active", v)} />
          </div>
          <div className="flex items-center justify-between rounded-md border p-3">
            <Label>Público</Label>
            <Switch checked={form.is_public} onCheckedChange={(v) => setF("is_public", v)} />
          </div>
          <div className="flex items-center justify-between rounded-md border p-3">
            <Label>Destaque (Mais popular)</Label>
            <Switch checked={!!form.is_featured} onCheckedChange={(v) => setF("is_featured", v)} />
          </div>
          {form.is_featured && (
            <div>
              <Label>Texto do selo</Label>
              <Input
                value={form.featured_label ?? ""}
                onChange={(e) => setF("featured_label", e.target.value)}
                placeholder="Mais popular"
              />
            </div>
          )}
        </div>

        <div className="space-y-3 pt-4 border-t">
          <h3 className="font-semibold text-sm">Limites e recursos</h3>
          <p className="text-xs text-muted-foreground">Use -1 para ilimitado.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Máx. empresas</Label>
              <Input type="number" value={form.features.max_companies}
                onChange={(e) => setFeat("max_companies", parseInt(e.target.value || "0"))} />
            </div>
            <div>
              <Label className="text-xs">Máx. lançamentos/mês</Label>
              <Input type="number" value={form.features.max_transactions_per_month}
                onChange={(e) => setFeat("max_transactions_per_month", parseInt(e.target.value || "0"))} />
            </div>
            <div>
              <Label className="text-xs">Máx. usuários/empresa</Label>
              <Input type="number" value={form.features.max_users_per_company}
                onChange={(e) => setFeat("max_users_per_company", parseInt(e.target.value || "0"))} />
            </div>
            <div>
              <Label className="text-xs">Máx. anexos/lançamento</Label>
              <Input type="number" value={form.features.max_attachments_per_transaction}
                onChange={(e) => setFeat("max_attachments_per_transaction", parseInt(e.target.value || "0"))} />
            </div>
          </div>
          <div className="rounded-md border p-3 space-y-3">

            <h4 className="text-sm font-medium">Cobrança por perfil de acesso</h4>
            <p className="text-xs text-muted-foreground">
              Configure cobrança adicional por perfil de acesso (empresa) além do incluído. Deixe 0 para não permitir extras (usa apenas o limite máximo).
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Perfis inclusos no preço</Label>
                <Input
                  type="number"
                  value={form.features.included_companies ?? form.features.max_companies ?? 1}
                  onChange={(e) => setFeat("included_companies", parseInt(e.target.value || "0"))}
                />
              </div>
              <div>
                <Label className="text-xs">Valor por perfil adicional (R$)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={((form.features.price_per_extra_company_cents ?? 0) / 100).toFixed(2)}
                  onChange={(e) =>
                    setFeat("price_per_extra_company_cents", Math.round(parseFloat(e.target.value || "0") * 100))
                  }
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              ["ai_enabled", "IA habilitada"],
              ["reports_advanced", "Relatórios avançados"],
              ["export_pdf", "Exportar PDF"],
              ["export_csv", "Exportar CSV"],
            ].map(([k, label]) => (
              <div key={k} className="flex items-center justify-between rounded-md border p-2">
                <Label className="text-xs">{label}</Label>
                <Switch checked={!!form.features[k]} onCheckedChange={(v) => setFeat(k, v)} />
              </div>
            ))}
          </div>
          <div>
            <Label className="text-xs">Tipo de suporte</Label>
            <Select
              value={form.features.support ?? "none"}
              onValueChange={(v) => setFeat("support", v === "none" ? null : v)}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sem suporte exibido</SelectItem>
                <SelectItem value="community">Suporte por comunidade</SelectItem>
                <SelectItem value="email">Suporte por e-mail</SelectItem>
                <SelectItem value="priority">Suporte prioritário</SelectItem>
                <SelectItem value="dedicated">Suporte dedicado</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => onSave(form)}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
