import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";

/** Solicitações do tipo "atestado" ainda pendentes (para bell + popout). */
export function useDpAtestadosPendentes() {
  const { selectedCompanyId } = useCompanyContext();
  return useQuery({
    queryKey: ["dp_atestados_pendentes", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dp_solicitacoes")
        .select("id, tipo, created_at, motivo, colaborador_id, dp_colaboradores(nome)")
        .eq("company_id", selectedCompanyId!)
        .eq("status", "pendente")
        .eq("tipo", "atestado")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
}
