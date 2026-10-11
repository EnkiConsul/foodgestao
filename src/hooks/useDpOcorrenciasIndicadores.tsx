import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";

export interface OcorrenciasIndicadores {
  atrasos: number;
  atraso_minutos: number;
  faltas: number;
  ausencias_justificadas: number;
  saidas_antecipadas: number;
  ausencias_cobertas: number;
  ausencias_descobertas: number;
  coberturas_previstas: number;
  coberturas_realizadas: number;
  coberturas_nao_realizadas: number;
  pendentes: number;
  total: number;
  esquecimentos: number;
  divergencias: number;
}

const VAZIO: OcorrenciasIndicadores = {
  atrasos: 0,
  atraso_minutos: 0,
  faltas: 0,
  ausencias_justificadas: 0,
  saidas_antecipadas: 0,
  ausencias_cobertas: 0,
  ausencias_descobertas: 0,
  coberturas_previstas: 0,
  coberturas_realizadas: 0,
  coberturas_nao_realizadas: 0,
  pendentes: 0,
  total: 0,
  esquecimentos: 0,
  divergencias: 0,
};

/** Indicadores das ocorrências em um intervalo (padrão: mês corrente). */
export function useDpOcorrenciasIndicadores(params: {
  inicio: string;
  fim: string;
  unidadeId?: string | null;
}) {
  const { selectedCompanyId } = useCompanyContext();
  const unidadeId = params.unidadeId && params.unidadeId !== "all" ? params.unidadeId : null;

  const query = useQuery({
    queryKey: ["dp_ocorrencias_indicadores", selectedCompanyId, params.inicio, params.fim, unidadeId],
    enabled: !!selectedCompanyId && !!params.inicio && !!params.fim,
    queryFn: async () => {
      const contar = async (tipos: string[]) => {
        let q = supabase
          .from("dp_ocorrencias")
          .select("id", { count: "exact", head: true })
          .eq("company_id", selectedCompanyId!)
          .gte("data_operacional", params.inicio)
          .lte("data_operacional", params.fim)
          .neq("estado", "cancelada")
          .in("tipo", tipos as never);
        if (unidadeId) q = q.eq("unidade_id", unidadeId);
        const { count } = await q;
        return count ?? 0;
      };
      const [{ data, error }, esquecimentos, divergencias] = await Promise.all([
        supabase.rpc("dp_ocorrencias_indicadores", {
          _company_id: selectedCompanyId!,
          _inicio: params.inicio,
          _fim: params.fim,
          _unidade_id: unidadeId,
        }),
        contar(["esquecimento_marcacao"]),
        contar(["divergencia_jornada", "atraso_intervalo", "previsao_atraso_intervalo"]),
      ]);
      if (error) throw error;
      return { ...VAZIO, ...((data ?? {}) as Partial<OcorrenciasIndicadores>), esquecimentos, divergencias };
    },
  });

  return { indicadores: query.data ?? VAZIO, loading: query.isLoading };
}
