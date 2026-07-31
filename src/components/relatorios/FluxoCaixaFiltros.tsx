import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Filter, X } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import {
  FLUXO_FILTROS_PADRAO,
  countActiveFluxoFiltros,
  type FluxoFiltros,
  type FluxoSituacao,
} from "@/lib/relatorios/fluxoCaixaFiltros";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SearchableSelect, type SearchableSelectOption } from "@/components/ui/searchable-select";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const ALL = "__all__";

export type FluxoFiltroOpcoes = {
  accounts: SearchableSelectOption[];
  paymentMethods: SearchableSelectOption[];
  creditCards: SearchableSelectOption[];
  costCenters: SearchableSelectOption[];
  contacts: SearchableSelectOption[];
};

/** Carrega as opções dos filtros respeitando contexto PF/PJ. */
export function useFluxoCaixaFiltroOpcoes(): FluxoFiltroOpcoes {
  const { user } = useAuth();
  const { contextType, selectedCompanyId } = useCompanyContext();
  const enabled = !!user && (contextType === "pf" || !!selectedCompanyId);

  const accounts = useQuery({
    queryKey: ["fc-filtro-accounts", user?.id, contextType, selectedCompanyId],
    enabled,
    queryFn: async () => {
      const { data } = await supabase.rpc("get_accessible_accounts", {
        _context: contextType,
        _company_id: contextType === "pj" ? selectedCompanyId! : undefined,
      });
      return (data ?? []) as Array<{ id: string; name: string }>;
    },
  });

  const paymentMethods = useQuery({
    queryKey: ["fc-filtro-payment-methods", user?.id, contextType, selectedCompanyId],
    enabled,
    queryFn: async () => {
      const { data } = await supabase.rpc("get_accessible_payment_methods", {
        _context: contextType,
        _company_id: contextType === "pj" ? selectedCompanyId! : undefined,
      });
      return (data ?? []) as unknown as Array<{ id: string; name: string }>;
    },
  });

  const creditCards = useQuery({
    queryKey: ["fc-filtro-credit-cards", user?.id, contextType, selectedCompanyId],
    enabled,
    queryFn: async () => {
      let q = supabase.from("credit_cards").select("id, brand, issuer, last4").eq("is_active", true);
      if (contextType === "pf") q = q.eq("context", "pf");
      else q = q.eq("context", "pj").eq("company_id", selectedCompanyId!);
      const { data } = await q;
      return (data ?? []) as Array<{ id: string; brand: string | null; issuer: string | null; last4: string | null }>;
    },
  });

  const costCenters = useQuery({
    queryKey: ["fc-filtro-cost-centers", user?.id, contextType, selectedCompanyId],
    enabled,
    queryFn: async () => {
      const { data } = await supabase
        .from("cost_centers")
        .select("id, name, visible_pf, cost_center_companies(company_id)")
        .eq("is_active", true)
        .order("name");
      return (data ?? []) as unknown as Array<{
        id: string;
        name: string;
        visible_pf: boolean | null;
        cost_center_companies: { company_id: string }[] | null;
      }>;
    },
  });

  const contacts = useQuery({
    queryKey: ["fc-filtro-contacts", user?.id, contextType, selectedCompanyId],
    enabled,
    queryFn: async () => {
      const { data } = await supabase
        .from("contacts")
        .select("id, name, contact_type, visible_pf, contact_companies(company_id)")
        .eq("is_active", true)
        .order("name");
      return (data ?? []) as unknown as Array<{
        id: string;
        name: string;
        contact_type: string | null;
        visible_pf: boolean | null;
        contact_companies: { company_id: string }[] | null;
      }>;
    },
  });

  return useMemo(() => {
    const inScope = (visiblePf: boolean | null, links: { company_id: string }[] | null) =>
      contextType === "pf"
        ? visiblePf !== false
        : !!selectedCompanyId && (links ?? []).some((l) => l.company_id === selectedCompanyId);

    return {
      accounts: (accounts.data ?? []).map((a) => ({ value: a.id, label: a.name })),
      paymentMethods: (paymentMethods.data ?? []).map((p) => ({ value: p.id, label: p.name })),
      creditCards: (creditCards.data ?? []).map((c) => ({
        value: c.id,
        label: [c.issuer || c.brand || "Cartão", c.last4 ? `•••• ${c.last4}` : null].filter(Boolean).join(" "),
      })),
      costCenters: (costCenters.data ?? [])
        .filter((c) => inScope(c.visible_pf, c.cost_center_companies))
        .map((c) => ({ value: c.id, label: c.name })),
      contacts: (contacts.data ?? [])
        .filter((c) => inScope(c.visible_pf, c.contact_companies))
        .map((c) => ({ value: c.id, label: c.name, keywords: c.contact_type ?? undefined })),
    };
  }, [accounts.data, paymentMethods.data, creditCards.data, costCenters.data, contacts.data, contextType, selectedCompanyId]);
}

type Props = {
  filtros: FluxoFiltros;
  onChange: (f: FluxoFiltros) => void;
  opcoes: FluxoFiltroOpcoes;
};

const SITUACAO_LABEL: Record<FluxoSituacao, string> = {
  todos: "Todos",
  pagos: "Pagos",
  a_vencer: "A vencer",
  atrasados: "Atrasados",
};

export function FluxoCaixaFiltros({ filtros, onChange, opcoes }: Props) {
  const active = countActiveFluxoFiltros(filtros);
  const set = <K extends keyof FluxoFiltros>(key: K, value: FluxoFiltros[K]) =>
    onChange({ ...filtros, [key]: value });

  const picker = (
    label: string,
    key: "accountId" | "paymentMethodId" | "creditCardId" | "costCenterId" | "contactId",
    options: SearchableSelectOption[],
  ) => (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <SearchableSelect
        value={filtros[key] ?? ALL}
        onValueChange={(v) => set(key, v === ALL ? null : v)}
        options={[{ value: ALL, label: `Todos — ${label}` }, ...options]}
        placeholder={`Todos — ${label}`}
        className="h-8 w-full text-xs"
      />
    </div>
  );

  return (
    <div className="flex items-center gap-2">
      <Select value={filtros.situacao} onValueChange={(v) => set("situacao", v as FluxoSituacao)}>
        <SelectTrigger className="h-8 w-[132px]" aria-label="Situação dos lançamentos">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(Object.keys(SITUACAO_LABEL) as FluxoSituacao[]).map((s) => (
            <SelectItem key={s} value={s}>
              {SITUACAO_LABEL[s]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 gap-1">
            <Filter className="h-3.5 w-3.5" />
            Filtros
            {active > 0 && (
              <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">
                {active}
              </Badge>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-[300px] space-y-3">
          {picker("Conta bancária", "accountId", opcoes.accounts)}
          {picker("Forma de pagamento", "paymentMethodId", opcoes.paymentMethods)}
          {picker("Cartão de crédito", "creditCardId", opcoes.creditCards)}
          {picker("Centro de custo", "costCenterId", opcoes.costCenters)}
          {picker("Cliente / Fornecedor", "contactId", opcoes.contacts)}

          <Button
            variant="ghost"
            size="sm"
            className="w-full gap-1 text-xs"
            disabled={active === 0}
            onClick={() => onChange({ ...FLUXO_FILTROS_PADRAO })}
          >
            <X className="h-3.5 w-3.5" /> Limpar filtros
          </Button>
        </PopoverContent>
      </Popover>
    </div>
  );
}
