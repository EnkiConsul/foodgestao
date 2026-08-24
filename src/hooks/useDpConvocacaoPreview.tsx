import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import {
  jornadaIndividualNaData,
  type ConfigDiaColaborador,
  type JornadaDia,
  type RegraCoberturaMinima,
} from "@/lib/dp/convocacoes-planejamento";

/** Estados de convocação que já ocupam a pessoa na data. */
export const CONVOCACAO_ESTADOS_BLOQUEANTES = ["pendente", "aceita"] as const;

/**
 * Dados reais usados pela PRÉVIA de elegibilidade do wizard:
 * indisponibilidades, escala já publicada/rascunho, convocações em estados
 * bloqueantes, jornada cadastrada por dia e mínimos de cobertura.
 *
 * Prévia apenas — o Bloco 2 revalida tudo no backend.
 */
export function useDpConvocacaoPreview(args: {
  unidadeId: string | null;
  inicio: string | null;
  fim: string | null;
}) {
  const { selectedCompanyId } = useCompanyContext();
  const { unidadeId, inicio, fim } = args;
  const habilitado = !!selectedCompanyId && !!inicio && !!fim;

  const indisponibilidades = useQuery({
    queryKey: ["dp_conv_prev_indisp", selectedCompanyId, inicio, fim],
    enabled: habilitado,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dp_indisponibilidades")
        .select("colaborador_id, data, cancelada_em")
        .eq("company_id", selectedCompanyId!)
        .gte("data", inicio!)
        .lte("data", fim!);
      if (error) throw error;
      return (data ?? []).filter((r) => !r.cancelada_em);
    },
  });

  const escala = useQuery({
    queryKey: ["dp_conv_prev_escala", selectedCompanyId, inicio, fim],
    enabled: habilitado,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dp_escala_itens")
        .select("colaborador_id, data, tipo")
        .eq("company_id", selectedCompanyId!)
        .gte("data", inicio!)
        .lte("data", fim!);
      if (error) throw error;
      return data ?? [];
    },
  });

  const convocacoes = useQuery({
    queryKey: ["dp_conv_prev_convocacoes", selectedCompanyId, inicio, fim],
    enabled: habilitado,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dp_convocacoes")
        .select("colaborador_id, data, status, dp_colaboradores(cargo_id)")
        .eq("company_id", selectedCompanyId!)
        .gte("data", inicio!)
        .lte("data", fim!)
        .in("status", [...CONVOCACAO_ESTADOS_BLOQUEANTES]);
      if (error) throw error;
      return data ?? [];
    },
  });

  const configDias = useQuery({
    queryKey: ["dp_conv_prev_config_dias", selectedCompanyId, unidadeId],
    enabled: !!selectedCompanyId,
    queryFn: async (): Promise<ConfigDiaColaborador[]> => {
      const { data, error } = await supabase
        .from("dp_colaborador_config_trabalho")
        .select(
          "colaborador_id, unidade_id, vigencia_fim, dp_colaborador_config_dias(dow, trabalha, entrada, saida, intervalo_minutos)",
        )
        .eq("company_id", selectedCompanyId!);
      if (error) throw error;
      const out: ConfigDiaColaborador[] = [];
      for (const c of (data ?? []) as any[]) {
        if (c.vigencia_fim) continue; // só a configuração vigente
        for (const d of c.dp_colaborador_config_dias ?? []) {
          out.push({
            colaborador_id: c.colaborador_id,
            dow: d.dow,
            trabalha: d.trabalha,
            entrada: d.entrada,
            saida: d.saida,
            intervalo_minutos: d.intervalo_minutos,
          });
        }
      }
      return out;
    },
  });

  const cobertura = useQuery({
    queryKey: ["dp_conv_prev_cobertura", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async (): Promise<RegraCoberturaMinima[]> => {
      const { data, error } = await supabase
        .from("dp_cobertura_minima")
        .select("unidade_id, cargo_id, dia_semana, minimo, ativo, vigencia_inicio, vigencia_fim")
        .eq("company_id", selectedCompanyId!);
      if (error) throw error;
      return (data ?? []).map((r) => ({
        unidade_id: r.unidade_id,
        cargo_id: r.cargo_id,
        dia_semana: r.dia_semana,
        minimo: r.minimo,
        ativo: r.ativo ?? true,
        vigencia_inicio: r.vigencia_inicio,
        vigencia_fim: r.vigencia_fim,
      }));
    },
  });

  const indisponiveisPorData = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const r of indisponibilidades.data ?? []) {
      if (!r.colaborador_id) continue;
      const set = m.get(r.data) ?? new Set<string>();
      set.add(r.colaborador_id);
      m.set(r.data, set);
    }
    return m;
  }, [indisponibilidades.data]);

  const alocadosPorData = useMemo(() => {
    const m = new Map<string, Set<string>>();
    const add = (data: string, id: string | null) => {
      if (!id) return;
      const set = m.get(data) ?? new Set<string>();
      set.add(id);
      m.set(data, set);
    };
    for (const r of (escala.data ?? []) as any[]) {
      if (r.tipo === "folga") continue;
      add(r.data, r.colaborador_id);
    }
    for (const r of (convocacoes.data ?? []) as any[]) add(r.data, r.colaborador_id);
    return m;
  }, [escala.data, convocacoes.data]);

  const jornadaDe = useMemo(
    () =>
      (colaboradorId: string, data: string): JornadaDia | null =>
        jornadaIndividualNaData({
          configDias: configDias.data ?? [],
          colaboradorId,
          data,
        }),
    [configDias.data],
  );

  /**
   * Contagem real por data + cargo. Pendente é contado à parte e NUNCA
   * somado a confirmado.
   */
  const contagemPorDataCargo = useMemo(() => {
    const m = new Map<string, { confirmados: number; aguardando: number }>();
    for (const r of (convocacoes.data ?? []) as any[]) {
      const cargoId = r.dp_colaboradores?.cargo_id ?? null;
      if (!cargoId) continue;
      const chave = `${r.data}|${cargoId}`;
      const atual = m.get(chave) ?? { confirmados: 0, aguardando: 0 };
      if (r.status === "aceita") atual.confirmados += 1;
      else atual.aguardando += 1;
      m.set(chave, atual);
    }
    return m;
  }, [convocacoes.data]);

  return {
    indisponiveisPorData,
    alocadosPorData,
    contagemPorDataCargo,
    jornadaDe,
    regrasCobertura: cobertura.data ?? [],
    isLoading:
      indisponibilidades.isLoading ||
      escala.isLoading ||
      convocacoes.isLoading ||
      configDias.isLoading ||
      cobertura.isLoading,
  };
}

