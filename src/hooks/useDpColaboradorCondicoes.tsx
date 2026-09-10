import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import type { Database } from "@/integrations/supabase/types";

export type CondicaoHistorico =
  Database["public"]["Tables"]["dp_colaborador_historico_condicoes"]["Row"];

/** Dia da semana enviado ao banco na alteração de condições. */
export interface CondicaoDiaInput {
  dow: number;
  trabalha: boolean;
  turno_id?: string | null;
  entrada?: string | null;
  saida?: string | null;
  intervalo_minutos?: number | null;
  setor_id?: string | null;
}

/** Benefício do catálogo com o valor que passa a valer na nova vigência. */
export interface CondicaoBeneficioInput {
  beneficio_id: string;
  ativo: boolean;
  valor?: number | null;
  desconto_valor?: number | null;
}

/**
 * VA, VT e prêmio de assiduidade: valores próprios do colaborador (vivem em
 * colunas de dp_colaboradores, não no catálogo de benefícios).
 */
export interface CondicaoBeneficiosFixosInput {
  vale_alimentacao: boolean;
  vale_alimentacao_valor?: number | null;
  vale_transporte: boolean;
  vale_transporte_valor_dia?: number | null;
  premio_assiduidade: boolean;
  premio_assiduidade_valor?: number | null;
}

export interface AplicarCondicaoInput {
  vigencia_inicio: string;
  regime?: string | null;
  forma_pagamento?: string | null;
  cargo_id?: string | null;
  unidade_id?: string | null;
  setor_id?: string | null;
  salario_base?: number | null;
  valor_hora?: number | null;
  base_horas_mes?: number | null;
  base_dias_mes?: number | null;
  justificativa?: string | null;
  observacoes?: string | null;
  /** Turno padrão da nova configuração de trabalho. */
  turno_padrao_id?: string | null;
  carga_semanal_horas?: number | null;
  folga_variavel?: boolean | null;
  folga_fixa_dow?: number | null;
  sindicato_id?: string | null;
  compoe_equipe_habitual?: boolean | null;
  dias?: CondicaoDiaInput[] | null;
  beneficios?: CondicaoBeneficioInput[] | null;
  /** VA/VT/assiduidade gravados direto no cadastro do colaborador. */
  beneficios_fixos?: CondicaoBeneficiosFixosInput | null;
  /** "continuidade" mantém a contagem; "novo_contrato" recomeça férias/13º/tempo de casa. */
  modo_continuidade?: "continuidade" | "novo_contrato";
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
        p_base_horas_mes: input.base_horas_mes ?? null,
        p_base_dias_mes: input.base_dias_mes ?? null,
        p_justificativa: input.justificativa ?? null,
        p_observacoes: input.observacoes ?? null,
        p_turno_padrao_id: input.turno_padrao_id ?? null,
        p_carga_semanal_horas: input.carga_semanal_horas ?? null,
        p_folga_variavel: input.folga_variavel ?? null,
        p_folga_fixa_dow: input.folga_fixa_dow ?? null,
        p_sindicato_id: input.sindicato_id ?? null,
        p_compoe_equipe_habitual: input.compoe_equipe_habitual ?? null,
        p_dias: (input.dias ?? null) as never,
        p_beneficios: (input.beneficios ?? null) as never,
        p_modo_continuidade: input.modo_continuidade ?? "continuidade",
      } as never);

      if (error) throw error;

      // VA/VT/assiduidade ficam no cadastro, não no catálogo de benefícios.
      if (input.beneficios_fixos) {
        const f = input.beneficios_fixos;
        const { error: errFixos } = await supabase
          .from("dp_colaboradores")
          .update({
            vale_alimentacao: f.vale_alimentacao,
            vale_alimentacao_valor: f.vale_alimentacao ? f.vale_alimentacao_valor ?? null : null,
            vale_transporte: f.vale_transporte,
            vale_transporte_valor_dia: f.vale_transporte ? f.vale_transporte_valor_dia ?? null : null,
            premio_assiduidade: f.premio_assiduidade,
            premio_assiduidade_valor: f.premio_assiduidade ? f.premio_assiduidade_valor ?? null : null,
          })
          .eq("id", colaboradorId);
        if (errFixos) throw errFixos;
      }
      return data as string;
    },
    onSuccess: () => {
      // A alteração muda contrato, jornada, benefícios e escala derivada.
      [
        "dp_colab_condicoes",
        "dp_colaboradores",
        "dp_colab_config_trabalho",
        "dp_colaborador_beneficios",
        "dp_beneficios",
        "dp_escala_itens",
        "dp_operacao_panorama",
        "dp_cargo_padrao",
        "dp_ferias",
        "dp_ferias_periodos",

      ].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
    },
  });

  return { ...query, historico: query.data ?? [], aplicar };
}
