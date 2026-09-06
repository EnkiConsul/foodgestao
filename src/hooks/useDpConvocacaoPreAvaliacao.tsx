import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface PreAvaliacaoLinha {
  ocorrencia_id: string;
  data: string;
  cargo_id: string | null;
  vagas: number | null;
  necessidade_entrada: string | null;
  necessidade_saida: string | null;
  necessidade_termina_no_dia_seguinte: boolean;
  horario_modo: string | null;
  colaborador_id: string;
  colaborador_nome: string | null;
  apto: boolean;
  motivo: string | null;
  entrada: string | null;
  saida: string | null;
  termina_no_dia_seguinte: boolean;
  jornada: {
    entrada: string | null;
    saida: string | null;
    intervalo_minutos: number | null;
    termina_no_dia_seguinte: boolean | null;
  } | null;
}

export interface PreAvaliacaoGrupo {
  grupo_id: string;
  restrito: boolean;
  linhas: PreAvaliacaoLinha[];
}

/** Verificação prévia (somente leitura) de quem pode receber a convocação. */
export function useDpConvocacaoPreAvaliacao(grupoId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ["dp_convocacao_pre_avaliacao", grupoId],
    enabled: !!grupoId && enabled,
    staleTime: 0,
    queryFn: async (): Promise<PreAvaliacaoGrupo | null> => {
      const { data, error } = await supabase.rpc("dp_convocacao_pre_avaliar_grupo", {
        p_grupo_id: grupoId!,
      });
      if (error) throw error;
      if (!data || typeof data !== "object") return null;
      const bruto = data as Record<string, unknown>;
      return {
        grupo_id: String(bruto.grupo_id ?? grupoId),
        restrito: bruto.restrito === true,
        linhas: Array.isArray(bruto.linhas) ? (bruto.linhas as PreAvaliacaoLinha[]) : [],
      };
    },
  });
}
