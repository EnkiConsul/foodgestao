import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { fetchAllPages } from "@/lib/supabase/fetchAllPages";

/** Solicitações do tipo "atestado" ainda pendentes (para bell + popout). */
export function useDpAtestadosPendentes() {
  const { selectedCompanyId } = useCompanyContext();
  return useQuery({
    queryKey: ["dp_atestados_pendentes", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      // Leitura em lotes com ordem estável: nenhuma pendência fica oculta.
      return await fetchAllPages<any>((from, to) =>
        supabase
          .from("dp_solicitacoes")
          .select("id, tipo, created_at, motivo, colaborador_id, dp_colaboradores(nome)")
          .is("removido_em", null)
          .eq("company_id", selectedCompanyId!)
          .eq("status", "pendente")
          .eq("tipo", "atestado")
          .order("created_at", { ascending: false })
          .order("id", { ascending: true })
          .range(from, to) as any,
      );
    },
  });
}
