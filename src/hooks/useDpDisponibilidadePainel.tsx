import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import type { DisponibilidadeJanela } from "@/lib/dp/disponibilidade-janela";

export interface DisponibilidadeDiaResumo {
  data: string;
  indisponiveis: number;
  disponiveis: number;
  pendentes: number;
  aceitas: number;
}

export interface DisponibilidadeConvocavel {
  colaborador_id: string;
  nome: string;
  regime: string | null;
  unidade_nome: string | null;
  cargo_nome: string | null;
  dias_indisponiveis: number;
  alteracoes_tardias: number;
  informou: boolean;
  ultima_informacao: string | null;
}

export interface DisponibilidadePainel {
  janela: DisponibilidadeJanela;
  resumo: {
    convocaveis: number;
    informaram: number;
    sem_informacao: number;
    alteracoes_tardias: number;
  };
  dias: DisponibilidadeDiaResumo[];
  colaboradores: DisponibilidadeConvocavel[];
}

/**
 * Visão do gestor sobre a disponibilidade dos convocáveis na competência.
 * Todo o cálculo (período, contagens, elegibilidade) vem do backend.
 */
export function useDpDisponibilidadePainel(unidadeId: string | null, competencia: string | null) {
  const { selectedCompanyId } = useCompanyContext();

  return useQuery({
    queryKey: ["dp_disponibilidade_painel", selectedCompanyId, unidadeId, competencia],
    enabled: !!selectedCompanyId,
    queryFn: async (): Promise<DisponibilidadePainel | null> => {
      const { data, error } = await (supabase.rpc as any)("dp_disponibilidade_painel", {
        _company_id: selectedCompanyId,
        _unidade_id: unidadeId ?? undefined,
        _competencia: competencia ?? undefined,
      });
      if (error) throw error;
      return (data ?? null) as DisponibilidadePainel | null;
    },
  });
}
