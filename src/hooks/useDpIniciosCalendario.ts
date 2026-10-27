import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { montarIniciosCalendario } from "@/lib/dp/inicios-calendario";

/** Pessoas 360: consulta administrativa sem criar ou efetivar admissões. */
export function useDpIniciosCalendario(competencia: string) {
  const { selectedCompanyId } = useCompanyContext();
  return useQuery({
    queryKey: ["dp_inicios_calendario", selectedCompanyId, competencia],
    enabled: !!selectedCompanyId,
    refetchInterval: 30_000,
    queryFn: async () => {
      if (!selectedCompanyId) return [];
      const [colaboradores, preadmissoes] = await Promise.all([
        supabase.from("dp_colaboradores").select("id,nome,unidade_id,regime,vinculo_label,origem_cadastro,data_admissao,data_base_contagem,data_desligamento").eq("company_id", selectedCompanyId).is("deleted_at", null),
        supabase.from("dp_preadmissoes").select("id,candidato_nome,status,unidade_prevista_id,colaborador_id,admin_dados").eq("company_id", selectedCompanyId).is("removido_em", null),
      ]);
      if (colaboradores.error) throw colaboradores.error;
      if (preadmissoes.error) throw preadmissoes.error;
      return montarIniciosCalendario(colaboradores.data ?? [], (preadmissoes.data ?? []).map((p) => ({ ...p, admin_dados: p.admin_dados as Record<string, unknown> | null })), competencia);
    },
  });
}