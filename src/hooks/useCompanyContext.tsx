import { createContext, useContext, useEffect, useState, ReactNode, useCallback, useMemo, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

type ContextType = "pf" | "pj";

interface Company {
  id: string;
  name: string;
  trade_name: string | null;
}

interface CompanyContextValue {
  contextType: ContextType;
  selectedCompanyId: string | null;
  companies: Company[];
  loading: boolean;
  setContext: (type: ContextType, companyId: string | null) => void;
  refreshCompanies: () => Promise<void>;
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
      if (parsed.contextType === "pf" || parsed.contextType === "pj") {
        return { contextType: parsed.contextType, selectedCompanyId: parsed.selectedCompanyId ?? null };
      }
    }
  } catch {}
  return { contextType: "pf", selectedCompanyId: null };
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

  useEffect(() => {
  const refreshCompanies = useCallback(async () => {
    if (!user) {
      setCompanies([]);
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
    setCompanies(list);

    // Validação do selectedCompanyId salvo: se o usuário perdeu acesso à
    // empresa, limpa e seleciona a primeira acessível. Se estiver em PJ
    // sem empresa disponível, força fallback para PF.
    setSelectedCompanyId((prev) => {
      if (contextTypeRef.current !== "pj") return prev;
      if (prev && list.some((c) => c.id === prev)) return prev;
      const fallback = list[0]?.id ?? null;
      if (!fallback) {
        setContextType("pf");
        persist("pf", null);
        return null;
      }
      persist("pj", fallback);
      return fallback;
    });

    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    refreshCompanies();
  }, [refreshCompanies]);

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
    () => ({ contextType, selectedCompanyId, companies, loading, setContext, refreshCompanies }),
    [contextType, selectedCompanyId, companies, loading, setContext, refreshCompanies]
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

