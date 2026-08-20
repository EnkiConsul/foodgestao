import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type TurnoVinculoOrigem = "turno_padrao" | "dias_fixos" | "escala";

export interface TurnoColaboradorRow {
  colaborador_id: string;
  nome: string;
  cargo_nome: string | null;
  unidade_nome: string | null;
  origem: TurnoVinculoOrigem;
  ativo: boolean;
}

/**
 * Colaboradores vinculados a um turno (turno padrão, dias fixos ou escala do mês
 * corrente em diante). Só consulta quando o painel de detalhe está aberto.
 */
export function useDpTurnoColaboradores(turnoId: string | null, enabled = true) {
  return useQuery({
    queryKey: ["dp_turno_colaboradores", turnoId],
    enabled: !!turnoId && enabled,
    queryFn: async (): Promise<TurnoColaboradorRow[]> => {
      const { data, error } = await supabase.rpc("dp_turno_colaboradores", {
        p_turno_id: turnoId!,
      });
      if (error) throw error;
      return (data ?? []) as TurnoColaboradorRow[];
    },
  });
}

export const ORIGEM_VINCULO_LABEL: Record<TurnoVinculoOrigem, string> = {
  turno_padrao: "Turno padrão",
  dias_fixos: "Dias fixos",
  escala: "Escala",
};
