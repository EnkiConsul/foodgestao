import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import {
  DP_CONFIG_DP_DEFAULT,
  type DpConfigDp,
  type ModoFrequencia,
} from "@/lib/dp/dsr-rules";

export type DpConfigDpForm = Omit<DpConfigDp, "company_id" | "unidade_id">;

interface ConfigRow extends DpConfigDpForm {
  id: string;
  unidade_id: string | null;
}

const COLUNAS =
  "id, company_id, unidade_id, setor_comercio, modo_frequencia_domingo, periodicidade_domingo, domingos_por_mes, " +
  "modo_frequencia_domingo_mulher, periodicidade_domingo_mulher, domingos_por_mes_mulher, " +
  "regra_dsr, exige_validacao_menor, tipo_descanso_domingo, dias_descanso_negociados, negociacao_id, folgas_fds_por_mes";

const asModo = (v: unknown): ModoFrequencia => (v === "por_mes" ? "por_mes" : "semanas");

function mapRow(data: Record<string, unknown>): ConfigRow {
  return {
    id: String(data.id),
    unidade_id: (data.unidade_id as string | null) ?? null,
    setor_comercio: !!data.setor_comercio,
    modo_frequencia_domingo: asModo(data.modo_frequencia_domingo),
    periodicidade_domingo: Number(data.periodicidade_domingo ?? 3),
    domingos_por_mes: Number(data.domingos_por_mes ?? 1),
    modo_frequencia_domingo_mulher: asModo(data.modo_frequencia_domingo_mulher),
    periodicidade_domingo_mulher: Number(data.periodicidade_domingo_mulher ?? 2),
    domingos_por_mes_mulher: Number(data.domingos_por_mes_mulher ?? 2),
    regra_dsr: (data.regra_dsr ?? "clt") as DpConfigDpForm["regra_dsr"],
    exige_validacao_menor: data.exige_validacao_menor !== false,
    tipo_descanso_domingo:
      data.tipo_descanso_domingo === "acordo_coletivo" ? "acordo_coletivo" : "legal",
    dias_descanso_negociados: ((data.dias_descanso_negociados as number[] | null) ?? [0]).map(Number),
    negociacao_id: (data.negociacao_id as string | null) ?? null,
    folgas_fds_por_mes: Number(data.folgas_fds_por_mes ?? 1),

  };
}
/** Remove campos de identidade da linha, deixando apenas os valores de regra. */
function stripIdentity(row: ConfigRow): DpConfigDpForm {
  const { id: _id, unidade_id: _unidade, ...regras } = row;
  return regras;
}


/**
 * Configuração de regras de folgas.
 * `unidadeId = null` retorna a regra padrão da empresa; com unidade, retorna a
 * exceção daquela loja quando existir, com fallback para o padrão.
 */
export function useDpConfigDp(unidadeId: string | null = null) {
  const { selectedCompanyId } = useCompanyContext();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["dp_config_dp", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async (): Promise<ConfigRow[]> => {
      const { data, error } = await supabase
        .from("dp_config_dp")
        .select(COLUNAS)
        .eq("company_id", selectedCompanyId!);
      if (error) throw error;
      return ((data ?? []) as unknown as Record<string, unknown>[]).map(mapRow);
    },
  });

  const rows = useMemo(() => query.data ?? [], [query.data]);
  const padraoRow = useMemo(() => rows.find((r) => r.unidade_id === null) ?? null, [rows]);
  const unidadeRow = useMemo(
    () => (unidadeId ? rows.find((r) => r.unidade_id === unidadeId) ?? null : null),
    [rows, unidadeId],
  );

  const unidadesConfiguradas = useMemo(
    () => new Set(rows.map((r) => r.unidade_id).filter((v): v is string => !!v)),
    [rows],
  );

  const configPadrao: DpConfigDpForm = useMemo(
    () => (padraoRow ? stripIdentity(padraoRow) : DP_CONFIG_DP_DEFAULT),
    [padraoRow],
  );
  const config: DpConfigDpForm = useMemo(
    () => (unidadeRow ? stripIdentity(unidadeRow) : configPadrao),
    [unidadeRow, configPadrao],
  );





  /** Existem colaboradoras mulheres cadastradas? Controla a exibição da regra do Art. 386. */
  const mulheres = useQuery({
    queryKey: ["dp_tem_mulheres", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async (): Promise<boolean> => {
      const { count, error } = await supabase
        .from("dp_colaboradores")
        .select("id", { count: "exact", head: true })
        .eq("company_id", selectedCompanyId!)
        .eq("sexo", "F");
      if (error) throw error;
      return (count ?? 0) > 0;
    },
  });

  const historico = useQuery({
    queryKey: ["dp_regras_historico", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dp_regras_historico")
        .select(
          "id, usuario_id, tabela, valor_antigo, valor_novo, justificativa, ciencia_confirmada, created_at",
        )
        .eq("company_id", selectedCompanyId!)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });

  /** Grava a regra de um alvo (unidade ou empresa) e registra o histórico. */
  const gravarAlvo = async (
    alvo: string | null,
    patch: Partial<DpConfigDpForm>,
    opts: { cienciaConfirmada?: boolean; justificativa?: string | null; rotulo?: string },
  ) => {
    if (!selectedCompanyId) throw new Error("Empresa não selecionada");
    const existente = rows.find((r) => r.unidade_id === alvo) ?? null;
    const base = existente ?? padraoRow ?? null;
    // Nunca herdar campos de identidade (id/unidade_id) da regra usada como base.
    const anterior: DpConfigDpForm = base ? stripIdentity(base) : DP_CONFIG_DP_DEFAULT;
    const merged: DpConfigDpForm = { ...anterior, ...patch };
    const payload = { ...merged, company_id: selectedCompanyId, unidade_id: alvo };

    if (existente) {
      const { error } = await supabase
        .from("dp_config_dp")
        .update(payload)
        .eq("id", existente.id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from("dp_config_dp").insert(payload);
      if (error) throw error;
    }

    const { data: userData } = await supabase.auth.getUser();
    const { error: histError } = await supabase.from("dp_regras_historico").insert({
      company_id: selectedCompanyId,
      usuario_id: userData.user?.id ?? null,
      tabela: alvo ? `Regras de folgas — ${opts.rotulo ?? `unidade ${alvo}`}` : "Regras de folgas — empresa",
      valor_antigo: anterior as unknown as never,
      valor_novo: merged as unknown as never,
      justificativa: opts.justificativa ?? null,
      ciencia_confirmada: !!opts.cienciaConfirmada,
    });
    if (histError) throw histError;

    return merged;
  };

  const save = useMutation({
    mutationFn: async (input: {
      patch: Partial<DpConfigDpForm>;
      /** Alvo da gravação: `null` = regra padrão da empresa. Default: unidade do hook. */
      unidadeId?: string | null;
      cienciaConfirmada?: boolean;
      justificativa?: string | null;
      rotulo?: string;
    }) => {
      const alvo = (input.unidadeId !== undefined ? input.unidadeId : unidadeId) ?? null;
      return gravarAlvo(alvo, input.patch, input);
    },

    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["dp_config_dp", selectedCompanyId] });
      void qc.invalidateQueries({ queryKey: ["dp_regras_historico", selectedCompanyId] });
    },
  });

  /** Grava a mesma regra em várias unidades (replicação). */
  const saveMany = useMutation({
    mutationFn: async (input: {
      patch: Partial<DpConfigDpForm>;
      /** Unidades alvo; `null` na lista representa o registro de retaguarda da empresa. */
      alvos: (string | null)[];
      nomes?: Record<string, string>;
      cienciaConfirmada?: boolean;
      justificativa?: string | null;
    }) => {
      for (const alvo of input.alvos) {
        await gravarAlvo(alvo, input.patch, {
          cienciaConfirmada: input.cienciaConfirmada,
          justificativa: input.justificativa,
          rotulo: alvo ? input.nomes?.[alvo] : undefined,
        });
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["dp_config_dp", selectedCompanyId] });
      void qc.invalidateQueries({ queryKey: ["dp_regras_historico", selectedCompanyId] });
    },
  });


  const removerExcecao = useMutation({
    mutationFn: async (alvo: string) => {
      if (!selectedCompanyId) throw new Error("Empresa não selecionada");
      const { error } = await supabase
        .from("dp_config_dp")
        .delete()
        .eq("company_id", selectedCompanyId)
        .eq("unidade_id", alvo);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["dp_config_dp", selectedCompanyId] });
    },
  });

  return {
    /** Regra efetiva (unidade quando existir, senão padrão da empresa). */
    config,
    /** Regra padrão da empresa. */
    configPadrao,
    /** Todas as regras cadastradas (padrão + exceções). */
    rows,
    /** A unidade selecionada possui regra própria? */
    temExcecao: !!unidadeRow,
    /** Ids das unidades que já possuem regra própria. */
    unidadesConfiguradas,

    temMulheres: mulheres.data ?? false,

    
    historico: historico.data ?? [],

    isLoading: query.isLoading,
    isError: query.isError,
    refetch: () => {
      void query.refetch();
      void historico.refetch();
    },
    save: save.mutateAsync,
    saving: save.isPending || saveMany.isPending,
    saveMany: saveMany.mutateAsync,
    removerExcecao: removerExcecao.mutateAsync,
    removendo: removerExcecao.isPending,

  };
}
