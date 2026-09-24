import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface CompanyUnidade {
  id: string;
  nome: string;
  ativo: boolean;
}

/** Unidades do Pessoas 360° da empresa, para escolher o que o usuário pode acessar. */
export function useCompanyUnidades(companyId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ["company-unidades-picker", companyId],
    enabled: !!companyId && enabled,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("dp_unidades")
        .select("id, nome, ativo")
        .eq("company_id", companyId!)
        .order("nome");
      return ((data ?? []) as CompanyUnidade[]).sort((a, b) =>
        (a.nome ?? "").localeCompare(b.nome ?? "", "pt-BR"),
      );
    },
  });
}
