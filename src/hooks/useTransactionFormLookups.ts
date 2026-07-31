/**
 * Hook centralizando todas as queries de lookup usadas por
 * `TransactionFormDialog` (contas, categorias, contatos, formas de pagamento
 * e seus mapas de company). Também registra o realtime sync e devolve um
 * `invalidateLookups` para reuso após inserções via subdiálogos.
 *
 * Comportamento equivalente ao inline anterior — extraído apenas para
 * reduzir o monólito do formulário.
 */

import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useRealtimeSync } from "@/hooks/useRealtimeSync";
import { supabase } from "@/integrations/supabase/client";

export function useTransactionFormLookups(enabled: boolean) {
  const { user } = useAuth();
  const { contextType, selectedCompanyId } = useCompanyContext();
  const queryClient = useQueryClient();

  const accountsQuery = useQuery({
    queryKey: ["form-accounts", user?.id, contextType, selectedCompanyId],
    enabled: !!user,
    queryFn: async () => {
      if (contextType === "pj" && !selectedCompanyId) return [];
      const { data, error } = await supabase.rpc("get_accessible_accounts", {
        _context: contextType,
        _company_id: contextType === "pj" ? selectedCompanyId! : undefined,
      });
      if (error) throw error;
      return data ?? [];
    },
  });

  const categoriesQuery = useQuery({
    queryKey: ["form-categories", user?.id, contextType, selectedCompanyId],
    enabled: !!user && (contextType === "pf" || !!selectedCompanyId),
    queryFn: async () => {
      const { data } = await supabase.rpc("get_accessible_categories", {
        _context: contextType,
        _company_id: contextType === "pj" ? selectedCompanyId! : undefined,
      });
      return (data ?? []) as any[];
    },
  });

  const contactsQuery = useQuery({
    queryKey: ["form-contacts", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("contacts").select("*")
        .eq("user_id", user!.id).eq("is_active", true).order("name");
      return data ?? [];
    },
  });

  const paymentMethodsQuery = useQuery({
    queryKey: ["form-payment-methods", user?.id, contextType, selectedCompanyId],
    enabled: !!user,
    queryFn: async () => {
      if (contextType === "pj" && !selectedCompanyId) return [];
      const { data } = await supabase.rpc("get_accessible_payment_methods", {
        _context: contextType,
        _company_id: contextType === "pj" ? selectedCompanyId! : undefined,
      });
      return (data ?? []) as any[];
    },
  });

  const creditCardsQuery = useQuery({
    queryKey: ["form-credit-cards", user?.id, contextType, selectedCompanyId],
    enabled: !!user,
    queryFn: async () => {
      let q = supabase
        .from("credit_cards")
        .select("id, brand, issuer, last4, closing_day, due_day")
        .eq("is_active", true);
      if (contextType === "pf") q = q.eq("context", "pf");
      else if (contextType === "pj" && selectedCompanyId) q = q.eq("context", "pj").eq("company_id", selectedCompanyId);
      const { data } = await q;
      return (data ?? []) as Array<{
        id: string;
        brand: string | null; issuer: string | null; last4: string | null;
        closing_day: number; due_day: number;
      }>;
    },
  });

  const costCentersQuery = useQuery({
    queryKey: ["form-cost-centers", user?.id, contextType, selectedCompanyId],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await (supabase.from("cost_centers" as any) as any)
        .select("id, name, is_active, visible_pf")
        .eq("is_active", true)
        .order("name");
      return (data ?? []) as { id: string; name: string; visible_pf: boolean }[];
    },
  });

  const costCenterCompaniesQuery = useQuery({
    queryKey: ["form-cost-center-companies", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await (supabase.from("cost_center_companies" as any) as any)
        .select("cost_center_id, company_id");
      return (data ?? []) as { cost_center_id: string; company_id: string }[];
    },
  });

  const categoryCompaniesQuery = useQuery({
    queryKey: ["form-category-companies", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("category_companies").select("category_id, company_id");
      return data ?? [];
    },
  });

  const contactCompaniesQuery = useQuery({
    queryKey: ["form-contact-companies", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("contact_companies").select("contact_id, company_id");
      return data ?? [];
    },
  });

  const paymentMethodCompaniesQuery = useQuery({
    queryKey: ["form-payment-method-companies", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await (supabase.from("payment_method_companies" as any) as any)
        .select("payment_method_id, company_id");
      return (data ?? []) as { payment_method_id: string; company_id: string }[];
    },
  });

  const categoryCompanyIds = useMemo(() => {
    const map = new Map<string, string[]>();
    (categoryCompaniesQuery.data ?? []).forEach((cc) => {
      const list = map.get(cc.category_id) || [];
      list.push(cc.company_id);
      map.set(cc.category_id, list);
    });
    return map;
  }, [categoryCompaniesQuery.data]);

  const contactCompanyIds = useMemo(() => {
    const map = new Map<string, string[]>();
    (contactCompaniesQuery.data ?? []).forEach((cc) => {
      const list = map.get(cc.contact_id) || [];
      list.push(cc.company_id);
      map.set(cc.contact_id, list);
    });
    return map;
  }, [contactCompaniesQuery.data]);

  const paymentMethodCompanyIds = useMemo(() => {
    const map = new Map<string, string[]>();
    (paymentMethodCompaniesQuery.data ?? []).forEach((pmc) => {
      const list = map.get(pmc.payment_method_id) || [];
      list.push(pmc.company_id);
      map.set(pmc.payment_method_id, list);
    });
    return map;
  }, [paymentMethodCompaniesQuery.data]);

  const costCenterCompanyIds = useMemo(() => {
    const map = new Map<string, string[]>();
    (costCenterCompaniesQuery.data ?? []).forEach((cc) => {
      const list = map.get(cc.cost_center_id) || [];
      list.push(cc.company_id);
      map.set(cc.cost_center_id, list);
    });
    return map;
  }, [costCenterCompaniesQuery.data]);

  useRealtimeSync({
    tables: ["accounts", "categories", "contacts", "payment_methods", "credit_cards", "cost_centers"],
    invalidateKeyPrefixes: ["form-"],
    enabled: !!user && enabled,
  });

  const invalidateLookups = () => {
    queryClient.invalidateQueries({
      predicate: (q) => typeof q.queryKey[0] === "string" && (q.queryKey[0] as string).startsWith("form-"),
    });
  };

  return {
    accounts: accountsQuery.data ?? [],
    categories: categoriesQuery.data ?? [],
    contacts: contactsQuery.data ?? [],
    paymentMethods: paymentMethodsQuery.data ?? [],
    creditCards: creditCardsQuery.data ?? [],
    costCenters: costCentersQuery.data ?? [],
    costCenterCompanyIds,
    categoryCompanyIds,
    contactCompanyIds,
    paymentMethodCompanyIds,
    invalidateLookups,
  };
}
