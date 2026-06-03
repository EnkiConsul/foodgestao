import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { CurrencyInput, formatCurrency, parseCurrencyToNumber } from "@/components/ui/currency-input";
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

/** Cents → formatted "1.234,56" (empty when 0 so placeholder shows on new plans). */
function centsToMasked(cents: number | null | undefined): string {
  if (!cents) return "";
  return formatCurrency(String(cents));
}

/** Formatted "1.234,56" → integer cents. */
function maskedToCents(masked: string): number {
  return Math.round(parseCurrencyToNumber(masked) * 100);
}

function sanitizeIntInput(raw: string, allowNegative = false): string {
  const cleaned = raw.replace(allowNegative ? /[^\d-]/g : /[^\d]/g, "");
  if (!allowNegative) return cleaned;
  // Keep '-' only at position 0.
  return cleaned.replace(/(?!^)-/g, "");
}

export function PlanEditorDialog({
  open, onOpenChange, plan, onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  plan: any | null;
  onSave: (data: any) => void;
}) {
  const [form, setForm] = useState<any>(DEFAULT_PLAN);
  // Free-typed string mirrors for numeric fields.
  const [priceReais, setPriceReais] = useState("0,00");
  const [extraReais, setExtraReais] = useState("0,00");
  const [trialStr, setTrialStr] = useState("0");
  const [orderStr, setOrderStr] = useState("0");
  const [maxCompaniesStr, setMaxCompaniesStr] = useState("1");
  const [maxTxStr, setMaxTxStr] = useState("50");
  const [maxUsersStr, setMaxUsersStr] = useState("1");
  const [maxAttachStr, setMaxAttachStr] = useState("1");
  const [includedStr, setIncludedStr] = useState("1");

  useEffect(() => {
    const base = plan
      ? { ...plan, features: { ...DEFAULT_PLAN.features, ...(plan.features || {}) } }
      : DEFAULT_PLAN;
    setForm(base);
    setPriceReais(centsToMasked(base.price_cents));
    setExtraReais(centsToMasked(base.features.price_per_extra_company_cents));
    setTrialStr(String(base.trial_days ?? 0));
    setOrderStr(String(base.sort_order ?? 0));
    setMaxCompaniesStr(String(base.features.max_companies ?? 1));
    setMaxTxStr(String(base.features.max_transactions_per_month ?? 0));
    setMaxUsersStr(String(base.features.max_users_per_company ?? 1));
    setMaxAttachStr(String(base.features.max_attachments_per_transaction ?? 1));
    setIncludedStr(String(base.features.included_companies ?? base.features.max_companies ?? 1));
  }, [plan, open]);

  const setF = (k: string, v: any) => setForm((s: any) => ({ ...s, [k]: v }));
  const setFeat = (k: string, v: any) =>
    setForm((s: any) => ({ ...s, features: { ...s.features, [k]: v } }));

  // Commit helpers run on blur — keep form numeric values in sync with the string mirrors.
  const commitMoney = (str: string, apply: (cents: number) => void, mirror: (s: string) => void) => {
    const cents = maskedToCents(str);
    apply(cents);
    mirror(centsToMasked(cents));
  };
  const commitInt = (str: string, fallback: number, apply: (n: number) => void, mirror: (s: string) => void, allowNegative = false) => {
    const n = parseInt(str, 10);
    const value = Number.isFinite(n) ? n : fallback;
    const safe = allowNegative ? value : Math.max(0, value);
    apply(safe);
    mirror(String(safe));
  };

  const handleSave = () => {
    // Force a final commit in case the user clicks Save while a field is focused.
    commitMoney(priceReais, (c) => setF("price_cents", c), setPriceReais);
    commitMoney(extraReais, (c) => setFeat("price_per_extra_company_cents", c), setExtraReais);
    commitInt(trialStr, 0, (n) => setF("trial_days", n), setTrialStr);
    commitInt(orderStr, 0, (n) => setF("sort_order", n), setOrderStr);
    commitInt(maxCompaniesStr, 1, (n) => setFeat("max_companies", n), setMaxCompaniesStr, true);
    commitInt(maxTxStr, 0, (n) => setFeat("max_transactions_per_month", n), setMaxTxStr, true);
    commitInt(maxUsersStr, 1, (n) => setFeat("max_users_per_company", n), setMaxUsersStr, true);
    commitInt(maxAttachStr, 1, (n) => setFeat("max_attachments_per_transaction", n), setMaxAttachStr, true);
    commitInt(includedStr, 1, (n) => setFeat("included_companies", n), setIncludedStr);
    // setState is async; build the payload synchronously from the committed values.
    const priceCents = maskedToCents(priceReais);
    const extraCents = maskedToCents(extraReais);
    const toInt = (s: string, fb: number, allowNeg = false) => {
      const n = parseInt(s, 10);
      const v = Number.isFinite(n) ? n : fb;
      return allowNeg ? v : Math.max(0, v);
    };
    const payload = {
      ...form,
      price_cents: priceCents,
      trial_days: toInt(trialStr, 0),
      sort_order: toInt(orderStr, 0),
      features: {
        ...form.features,
        price_per_extra_company_cents: extraCents,
        max_companies: toInt(maxCompaniesStr, 1, true),
        max_transactions_per_month: toInt(maxTxStr, 0, true),
        max_users_per_company: toInt(maxUsersStr, 1, true),
        max_attachments_per_transaction: toInt(maxAttachStr, 1, true),
        included_companies: toInt(includedStr, 1),
      },
    };
    onSave(payload);
  };

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
              inputMode="decimal"
              value={priceReais}
              onChange={(e) => setPriceReais(sanitizeMoneyInput(e.target.value))}
              onBlur={() => commitMoney(priceReais, (c) => setF("price_cents", c), setPriceReais)}
              placeholder="0,00"
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
            <Input
              inputMode="numeric"
              value={trialStr}
              onChange={(e) => setTrialStr(sanitizeIntInput(e.target.value))}
              onBlur={() => commitInt(trialStr, 0, (n) => setF("trial_days", n), setTrialStr)}
            />
          </div>
          <div>
            <Label>Ordem</Label>
            <Input
              inputMode="numeric"
              value={orderStr}
              onChange={(e) => setOrderStr(sanitizeIntInput(e.target.value))}
              onBlur={() => commitInt(orderStr, 0, (n) => setF("sort_order", n), setOrderStr)}
            />
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
              <Input
                inputMode="numeric"
                value={maxCompaniesStr}
                onChange={(e) => setMaxCompaniesStr(sanitizeIntInput(e.target.value, true))}
                onBlur={() => commitInt(maxCompaniesStr, 1, (n) => setFeat("max_companies", n), setMaxCompaniesStr, true)}
              />
            </div>
            <div>
              <Label className="text-xs">Máx. lançamentos/mês</Label>
              <Input
                inputMode="numeric"
                value={maxTxStr}
                onChange={(e) => setMaxTxStr(sanitizeIntInput(e.target.value, true))}
                onBlur={() => commitInt(maxTxStr, 0, (n) => setFeat("max_transactions_per_month", n), setMaxTxStr, true)}
              />
            </div>
            <div>
              <Label className="text-xs">Máx. usuários/empresa</Label>
              <Input
                inputMode="numeric"
                value={maxUsersStr}
                onChange={(e) => setMaxUsersStr(sanitizeIntInput(e.target.value, true))}
                onBlur={() => commitInt(maxUsersStr, 1, (n) => setFeat("max_users_per_company", n), setMaxUsersStr, true)}
              />
            </div>
            <div>
              <Label className="text-xs">Máx. anexos/lançamento</Label>
              <Input
                inputMode="numeric"
                value={maxAttachStr}
                onChange={(e) => setMaxAttachStr(sanitizeIntInput(e.target.value, true))}
                onBlur={() => commitInt(maxAttachStr, 1, (n) => setFeat("max_attachments_per_transaction", n), setMaxAttachStr, true)}
              />
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
                  inputMode="numeric"
                  value={includedStr}
                  onChange={(e) => setIncludedStr(sanitizeIntInput(e.target.value))}
                  onBlur={() => commitInt(includedStr, 1, (n) => setFeat("included_companies", n), setIncludedStr)}
                />
              </div>
              <div>
                <Label className="text-xs">Valor por perfil adicional (R$)</Label>
                <Input
                  inputMode="decimal"
                  value={extraReais}
                  onChange={(e) => setExtraReais(sanitizeMoneyInput(e.target.value))}
                  onBlur={() => commitMoney(extraReais, (c) => setFeat("price_per_extra_company_cents", c), setExtraReais)}
                  placeholder="0,00"
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
          <Button onClick={handleSave}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
