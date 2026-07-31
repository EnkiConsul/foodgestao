import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompanyContext } from "@/hooks/useCompanyContext";

/**
 * Conta as categorias do contexto atual que ainda não têm conta contábil vinculada.
 * Essas categorias ficam de fora do DRE Gerencial.
 */
export function useCategoriasSemConta() {
  const { user } = useAuth();
  const { contextType, selectedCompanyId } = useCompanyContext();

  return useQuery({
    queryKey: ["contabeis-categorias-sem-conta", contextType, selectedCompanyId],
    enabled: !!user && (contextType === "pf" || !!selectedCompanyId),
    staleTime: 30_000,
    queryFn: async () => {
      let query = supabase
        .from("categories")
        .select(
          contextType === "pj"
            ? "id, name, category_companies!inner(company_id)"
            : "id, name",
          { count: "exact", head: false }
        )
        .is("chart_account_id", null)
        .eq("is_active", true);

      if (contextType === "pj") {
        query = query.eq("category_companies.company_id", selectedCompanyId!);
      } else {
        query = query.eq("context", "pf").eq("user_id", user!.id);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []).length;
    },
  });
}
