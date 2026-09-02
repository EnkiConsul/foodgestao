import { createContext, useContext, useEffect, useState, ReactNode, useCallback, useMemo, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { subscribeRealtime } from "@/lib/realtimeHub";
import { toast } from "sonner";

type ContextType = "pf" | "pj";

interface Company {
  id: string;
  name: string;
  trade_name: string | null;
}

interface RefreshResult {
  previous: Company[];
  list: Company[];
}

interface CompanyContextValue {
  contextType: ContextType;
  selectedCompanyId: string | null;
  companies: Company[];
  loading: boolean;
  /** true enquanto uma atualização disparada por tempo real está em curso */
  syncing: boolean;
  setContext: (type: ContextType, companyId: string | null) => void;
  refreshCompanies: () => Promise<RefreshResult | undefined>;
}

const label = (c: Company) => c.trade_name || c.name;

/** Toast descrevendo o que mudou na lista de empresas após um evento realtime. */
function notifyCompanyDiff(previous: Company[], list: Company[]) {
  if (previous.length === 0 && list.length === 0) return;
  const prevById = new Map(previous.map((c) => [c.id, c]));
  const nextById = new Map(list.map((c) => [c.id, c]));

  const added = list.filter((c) => !prevById.has(c.id));
  const removed = previous.filter((c) => !nextById.has(c.id));
  const renamed = list.filter((c) => {
    const before = prevById.get(c.id);
    return before && label(before) !== label(c);
  });

  if (added.length === 1) {
    toast.success(`Empresa adicionada: ${label(added[0])}`, { description: "Seletor de empresas atualizado." });
  } else if (added.length > 1) {
    toast.success(`${added.length} empresas adicionadas`, { description: "Seletor de empresas atualizado." });
  }

  if (removed.length === 1) {
    toast.info(`Empresa removida do seletor: ${label(removed[0])}`);
  } else if (removed.length > 1) {
    toast.info(`${removed.length} empresas removidas do seletor`);
  }

  if (added.length === 0 && removed.length === 0 && renamed.length > 0) {
    toast.info(
      renamed.length === 1 ? `Empresa atualizada: ${label(renamed[0])}` : `${renamed.length} empresas atualizadas`,
    );
  }
}

const CompanyContext = createContext<CompanyContextValue | undefined>(undefined);

const STORAGE_KEY = "app-company-context";

// Prefixos de queryKey cujo cache deve ser invalidado ao trocar de empresa.
// Cobrimos telas financeiras + hooks de lookup + DP com escopo por empresa.
const FINANCIAL_KEY_PREFIXES = [
  "dashboard-",
  "fluxo-caixa-",
  "relatorios-",
  "budget",
  "budgets",
  "categories-page",
  "category-companies",
  "contacts-page",
  "contact-companies-page",
  "payment-methods",
  "payment-method-companies",
  "chart-accounts",
  "form-",
  "credit-cards",
  "credit-card-",
  "upcoming-card-invoices",
  "cash-flow-projection",
  "form-transactions",
  "dp-",
];

function keyMatchesFinancial(key: unknown): boolean {
  if (!Array.isArray(key)) return false;
  const first = key[0];
  if (typeof first !== "string") return false;
  return FINANCIAL_KEY_PREFIXES.some((p) => first === p || first.startsWith(p));
}

function loadFromStorage(): { contextType: ContextType; selectedCompanyId: string | null } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.contextType === "pj") {
        return { contextType: "pj", selectedCompanyId: parsed.selectedCompanyId ?? null };
      }
    }
  } catch {}
  // A plataforma é exclusivamente empresarial: o único contexto é PJ.
  return { contextType: "pj", selectedCompanyId: null };
}

function persist(contextType: ContextType, selectedCompanyId: string | null) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ contextType, selectedCompanyId: contextType === "pf" ? null : selectedCompanyId }),
  );
}

export function CompanyContextProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);

  const stored = loadFromStorage();
  const [contextType, setContextType] = useState<ContextType>(stored.contextType);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(stored.selectedCompanyId);
  const lastActiveScopeRef = useRef<string>(`${stored.contextType}|${stored.selectedCompanyId ?? ""}`);
  const contextTypeRef = useRef<ContextType>(stored.contextType);
  contextTypeRef.current = contextType;

  const [syncing, setSyncing] = useState(false);
  const companiesRef = useRef<Company[]>([]);

  const refreshCompanies = useCallback(async () => {
    if (!user) {
      setCompanies([]);
      companiesRef.current = [];
      setLoading(false);
      return;
    }
    setLoading(true);
    const [ownedRes, memberRes] = await Promise.all([
      supabase
        .from("companies")
        .select("id, name, trade_name")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .order("name"),
      supabase
        .from("company_members")
        .select("company_id, companies!inner(id, name, trade_name, is_active)")
        .eq("user_id", user.id)
        .eq("companies.is_active", true),
    ]);

    const byId = new Map<string, Company>();
    (ownedRes.data ?? []).forEach((c) => byId.set(c.id, c));
    (memberRes.data ?? []).forEach((row: any) => {
      const c = row.companies;
      if (c?.id) byId.set(c.id, { id: c.id, name: c.name, trade_name: c.trade_name });
    });
    const list = Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name));
    const previous = companiesRef.current;
    companiesRef.current = list;
    setCompanies(list);

    // Validação do selectedCompanyId salvo: se o usuário perdeu acesso à
    // empresa, limpa e seleciona a primeira acessível. Sem empresa
    // disponível, permanece em PJ (o app segue para o fluxo de onboarding).
    setSelectedCompanyId((prev) => {
      if (contextTypeRef.current !== "pj") return prev;
      if (prev && list.some((c) => c.id === prev)) return prev;
      const fallback = list[0]?.id ?? null;
      if (!fallback) return null;
      persist("pj", fallback);
      return fallback;
    });

    setLoading(false);
    return { previous, list };
  }, [user?.id]);

  useEffect(() => {
    refreshCompanies();
  }, [refreshCompanies]);

  // Atualização em tempo real: qualquer criação/edição/ativação/exclusão de
  // empresa (ou de vínculo de membro) recarrega a lista do seletor sem reload,
  // com feedback visual (spinner no seletor + toast do que mudou).
  useEffect(() => {
    if (!user?.id) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      if (timer) clearTimeout(timer);
      setSyncing(true);
      timer = setTimeout(async () => {
        timer = null;
        try {
          const result = await refreshCompanies();
          if (result) notifyCompanyDiff(result.previous, result.list);
        } finally {
          setSyncing(false);
        }
      }, 250);
    };
    const unsubs = [
      subscribeRealtime("companies", `user_id=eq.${user.id}`, schedule),
      subscribeRealtime("company_members", `user_id=eq.${user.id}`, schedule),
    ];
    return () => {
      if (timer) clearTimeout(timer);
      unsubs.forEach((fn) => fn());
    };
  }, [user?.id, refreshCompanies]);

  // Ao mudar de escopo (contextType + empresa), invalida caches financeiros
  // para impedir vazamento de dados de uma empresa em outra.
  useEffect(() => {
    const nextScope = `${contextType}|${selectedCompanyId ?? ""}`;
    if (lastActiveScopeRef.current !== nextScope) {
      lastActiveScopeRef.current = nextScope;
      queryClient.removeQueries({ predicate: (q) => keyMatchesFinancial(q.queryKey) });
    }
  }, [contextType, selectedCompanyId, queryClient]);

  const setContext = useCallback((type: ContextType, companyId: string | null) => {
    setContextType(type);
    const nextCompany = type === "pf" ? null : companyId;
    setSelectedCompanyId(nextCompany);
    persist(type, nextCompany);
  }, []);

  const value = useMemo(
    () => ({ contextType, selectedCompanyId, companies, loading, syncing, setContext, refreshCompanies }),
    [contextType, selectedCompanyId, companies, loading, syncing, setContext, refreshCompanies]
  );

  return (
    <CompanyContext.Provider value={value}>
      {children}
    </CompanyContext.Provider>
  );
}

export function useCompanyContext() {
  const context = useContext(CompanyContext);
  if (!context) throw new Error("useCompanyContext must be used within CompanyContextProvider");
  return context;
}

