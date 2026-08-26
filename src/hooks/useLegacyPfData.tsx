import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

/**
 * Detecta se o usuário possui dados financeiros PF legados (conta, categoria
 * ou lançamento no contexto pessoal). Usado para decidir se o contexto
 * "Pessoal" deve aparecer — contas novas são PJ-first e nunca veem PF.
 */
export function useLegacyPfData() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["legacy-pf-data", user?.id],
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const uid = user!.id;
      const [accounts, transactions, categories] = await Promise.all([
        supabase
          .from("accounts")
          .select("id", { count: "exact", head: true })
          .eq("user_id", uid)
          .eq("context", "pf")
          .is("company_id", null)
          .is("soft_deleted_at", null)
          .limit(1),
        supabase
          .from("transactions")
          .select("id", { count: "exact", head: true })
          .eq("user_id", uid)
          .eq("context", "pf")
          .is("company_id", null)
          .limit(1),
        supabase
          .from("categories")
          .select("id", { count: "exact", head: true })
          .eq("user_id", uid)
          .eq("context", "pf")
          .is("company_id", null)
          .limit(1),
      ]);
      return (
        (accounts.count ?? 0) > 0 ||
        (transactions.count ?? 0) > 0 ||
        (categories.count ?? 0) > 0
      );
    },
  });
}
