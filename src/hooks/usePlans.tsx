import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Lista somente leitura dos planos existentes.
 *
 * A gestão de planos foi removida do produto; esta consulta continua apenas
 * para exibir o plano vinculado em Assinaturas e nas isenções do Backoffice.
 */
export function usePlans() {
  return useQuery({
    queryKey: ["admin-plans"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("plans")
        .select("*")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}
