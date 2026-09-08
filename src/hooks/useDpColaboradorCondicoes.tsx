import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import type { Database } from "@/integrations/supabase/types";

export type CondicaoHistorico =
  Database["public"]["Tables"]["dp_colaborador_historico_condicoes"]["Row"];

export interface AplicarCondicaoInput {
  vigencia_inicio: string;
  regime?: string | null;
  forma_pagamento?: string | null;
  cargo_id?: string | null;
  unidade_id?: string | null;
  setor_id?: string | null;
  salario_base?: number | null;
  valor_hora?: number | null;
  justificativa?: string | null;
  observacoes?: string | null;
}

/**
 * Histórico de condições de trabalho do colaborador (vínculo, cargo, unidade,
 * setor e remuneração) com vigência. A alteração é aplicada por rotina no banco,
 * que encerra a vigência anterior no dia anterior e nunca sobrescreve o passado.
 */
export function useDpColaboradorCondicoes(colaboradorId?: string | null) {
  const { selectedCompanyId } = useCompanyContext();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["dp_colab_condicoes", selectedCompanyId, colaboradorId],
    enabled: !!selectedCompanyId && !!colaboradorId,
    queryFn: async (): Promise<CondicaoHistorico[]> => {
      const { data, error } = await supabase
        .from("dp_colaborador_historico_condicoes")
        .select("*")
        .eq("company_id", selectedCompanyId!)
        .eq("colaborador_id", colaboradorId!)
        .order("vigencia_inicio", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const aplicar = useMutation({
    mutationFn: async (input: AplicarCondicaoInput) => {
      if (!colaboradorId) throw new Error("Colaborador não informado.");
      const { data, error } = await supabase.rpc("dp_colaborador_aplicar_condicao", {
        p_colaborador_id: colaboradorId,
        p_vigencia_inicio: input.vigencia_inicio,
        p_regime: input.regime ?? null,
        p_forma_pagamento: input.forma_pagamento ?? null,
        p_cargo_id: input.cargo_id ?? null,
        p_unidade_id: input.unidade_id ?? null,
        p_setor_id: input.setor_id ?? null,
        p_salario_base: input.salario_base ?? null,
        p_valor_hora: input.valor_hora ?? null,
        p_base_horas_mes: null,
        p_base_dias_mes: null,
        p_justificativa: input.justificativa ?? null,
        p_observacoes: input.observacoes ?? null,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dp_colab_condicoes"] });
      qc.invalidateQueries({ queryKey: ["dp_colaboradores"] });
    },
  });

  return { ...query, historico: query.data ?? [], aplicar };
}
