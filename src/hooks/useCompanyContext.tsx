import { createContext, useContext, useEffect, useState, ReactNode, useCallback, useMemo } from "react";
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
}

const CompanyContext = createContext<CompanyContextValue | undefined>(undefined);

const STORAGE_KEY = "app-company-context";

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

export function CompanyContextProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);

  const stored = loadFromStorage();
  const [contextType, setContextType] = useState<ContextType>(stored.contextType);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(stored.selectedCompanyId);

  useEffect(() => {
    if (!user) {
      setCompanies([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    Promise.all([
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
    ]).then(([ownedRes, memberRes]) => {
        const byId = new Map<string, Company>();
        (ownedRes.data ?? []).forEach((c) => byId.set(c.id, c));
        (memberRes.data ?? []).forEach((row: any) => {
          const c = row.companies;
          if (c?.id) byId.set(c.id, { id: c.id, name: c.name, trade_name: c.trade_name });
        });
        setCompanies(Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name)));
        setLoading(false);
      });
    // Depende apenas do user.id para não refazer fetch em refresh de token
  }, [user?.id]);

  const setContext = useCallback((type: ContextType, companyId: string | null) => {
    setContextType(type);
    setSelectedCompanyId(type === "pf" ? null : companyId);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ contextType: type, selectedCompanyId: type === "pf" ? null : companyId }));
  }, []);

  const value = useMemo(
    () => ({ contextType, selectedCompanyId, companies, loading, setContext }),
    [contextType, selectedCompanyId, companies, loading, setContext]
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
