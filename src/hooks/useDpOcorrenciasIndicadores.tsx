import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { tratativaPendente } from "@/lib/dp/ocorrencias";

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
  /** Contagem por tipo (fatos e previsões separados), sem canceladas. */
  porTipo: Record<string, number>;
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
  porTipo: {},
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
      let q = supabase
        .from("dp_ocorrencias")
        .select("tipo, minutos, estado, origem, analise_status, impacta_assiduidade, impacta_ferias, tratativa_ponto, tratativa_status, folga_id, troca_id, subtipo")
        .eq("company_id", selectedCompanyId!)
        .gte("data_operacional", params.inicio)
        .lte("data_operacional", params.fim)
        .neq("estado", "cancelada")
        .limit(5000);
      if (unidadeId) q = q.eq("unidade_id", unidadeId);
      const [{ data, error }, tipos] = await Promise.all([
        supabase.rpc("dp_ocorrencias_indicadores", {
          _company_id: selectedCompanyId!,
          _inicio: params.inicio,
          _fim: params.fim,
          _unidade_id: unidadeId,
        }),
        q,
      ]);
      const porTipo: Record<string, number> = {};
      let atraso_minutos = 0;
      let pendentes = 0;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const r of (tipos.data ?? []) as any[]) {
        if (
          r.estado === "aguardando_confirmacao" || r.analise_status === "pendente" ||
          tratativaPendente(r) || r.impacta_assiduidade === "aguardando" || r.impacta_ferias === "aguardando"
        ) pendentes++;
        porTipo[r.tipo] = (porTipo[r.tipo] ?? 0) + 1;
        if (r.tipo === "atraso") atraso_minutos += Number(r.minutos ?? 0);
      }
      const esquecimentos = porTipo.esquecimento_marcacao ?? 0;
      const divergencias = porTipo.divergencia_jornada ?? 0;
      if (error) throw error;
      return { ...VAZIO, ...((data ?? {}) as Partial<OcorrenciasIndicadores>), atraso_minutos, esquecimentos, divergencias, porTipo, pendentes: tipos.error ? (data as any)?.pendentes ?? 0 : pendentes };
    },
  });

  return { indicadores: query.data ?? VAZIO, loading: query.isLoading };
}
