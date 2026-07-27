import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import type { Database } from "@/integrations/supabase/types";
import type { ConfigTrabalho, DiaConfig, TurnoResolvido } from "@/lib/dp/config-trabalho";
import { normalizarDias } from "@/lib/dp/config-trabalho";
import {
  diasDaCompetencia,
  gerarEscalaMes,
  type AusenciaIntervalo,
  type ColaboradorEscala,
  type EscalaItem,
} from "@/lib/dp/escala-mes";

export type EscalaRow = Database["public"]["Tables"]["dp_escalas"]["Row"];
export type EscalaItemRow = Database["public"]["Tables"]["dp_escala_itens"]["Row"];

const limites = (competencia: string) => {
  const dias = diasDaCompetencia(competencia);
  return { inicio: dias[0], fim: dias[dias.length - 1] };
};

/** Converte a linha do banco no item de domínio. */
export function linhaParaItem(row: EscalaItemRow): EscalaItem {
  return {
    colaborador_id: row.colaborador_id,
    data: row.data,
    tipo: row.tipo,
    turno_id: row.turno_id,
    entrada: row.entrada ? row.entrada.slice(0, 5) : null,
    saida: row.saida ? row.saida.slice(0, 5) : null,
    intervalo_minutos: row.intervalo_minutos ?? 0,
    termina_no_dia_seguinte: row.termina_no_dia_seguinte,
    carga_prevista_horas: Number(row.carga_prevista_horas ?? 0),
    origem: row.origem,
    observacao: row.observacao,
  };
}

/**
 * Escala do mês de uma unidade: cabeçalho, itens salvos, base para geração
 * (colaboradores + configuração vigente + turnos + férias) e mutações.
 */
export function useDpEscalaMes(competencia: string, unidadeId: string | null) {
  const { selectedCompanyId } = useCompanyContext();
  const qc = useQueryClient();
  const { inicio, fim } = useMemo(() => limites(competencia), [competencia]);

  const escala = useQuery({
    queryKey: ["dp_escala_mes", selectedCompanyId, competencia, unidadeId],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      let q = supabase
        .from("dp_escalas")
        .select("*")
        .eq("company_id", selectedCompanyId!)
        .eq("competencia", competencia);
      q = unidadeId ? q.eq("unidade_id", unidadeId) : q.is("unidade_id", null);
      const { data, error } = await q.maybeSingle();
      if (error) throw error;
      return (data ?? null) as EscalaRow | null;
    },
  });

  const escalaId = escala.data?.id ?? null;

  const itens = useQuery({
    queryKey: ["dp_escala_itens", escalaId],
    enabled: !!escalaId,
    queryFn: async (): Promise<EscalaItemRow[]> => {
      const { data, error } = await supabase
        .from("dp_escala_itens")
        .select("*")
        .eq("escala_id", escalaId!)
        .order("data");
      if (error) throw error;
      return data ?? [];
    },
  });

  const base = useQuery({
    queryKey: ["dp_escala_base_mes", selectedCompanyId, competencia, unidadeId],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const [colabs, turnos, configs, ferias] = await Promise.all([
        supabase
          .from("dp_colaboradores")
          .select("id, nome, regime, unidade_id")
          .eq("company_id", selectedCompanyId!)
          .eq("ativo", true)
          .order("nome"),
        supabase
          .from("dp_turnos")
          .select("id, nome, cor, entrada, saida, intervalo_minutos, unidade_id, ativo")
          .eq("company_id", selectedCompanyId!),
        supabase
          .from("dp_colaborador_config_trabalho")
          .select("*, dias:dp_colaborador_config_dias(dow, trabalha, turno_id)")
          .eq("company_id", selectedCompanyId!)
          .lte("vigencia_inicio", fim)
          .order("vigencia_inicio", { ascending: false }),
        supabase
          .from("dp_ferias_gozos")
          .select("colaborador_id, data_inicio, data_fim, status")
          .eq("company_id", selectedCompanyId!)
          .lte("data_inicio", fim)
          .gte("data_fim", inicio),
      ]);
      const err = [colabs, turnos, configs, ferias].find((r) => r.error);
      if (err?.error) throw err.error;
      return {
        colaboradores: colabs.data ?? [],
        turnos: turnos.data ?? [],
        configs: configs.data ?? [],
        ferias: ferias.data ?? [],
      };
    },
  });

  /** Turnos válidos para a unidade (turnos globais incluídos). */
  const turnos: TurnoResolvido[] = useMemo(
    () =>
      (base.data?.turnos ?? [])
        .filter((t) => !unidadeId || t.unidade_id === unidadeId || t.unidade_id === null)
        .map((t) => ({
          id: t.id,
          nome: t.nome,
          cor: t.cor,
          entrada: (t.entrada ?? "").slice(0, 5),
          saida: (t.saida ?? "").slice(0, 5),
          intervalo_minutos: t.intervalo_minutos ?? 0,
        })),
    [base.data, unidadeId],
  );

  /** Colaboradores da unidade com a configuração vigente na competência. */
  const colaboradores: ColaboradorEscala[] = useMemo(() => {
    const d = base.data;
    if (!d) return [];
    return d.colaboradores
      .filter((c) => !unidadeId || c.unidade_id === unidadeId)
      .map((c) => {
        const vigente = d.configs.find(
          (cfg) =>
            cfg.colaborador_id === c.id &&
            cfg.vigencia_inicio <= fim &&
            (!cfg.vigencia_fim || cfg.vigencia_fim >= inicio),
        );
        const config: ConfigTrabalho | null = vigente
          ? {
              turno_padrao_id: vigente.turno_padrao_id,
              folga_variavel: vigente.folga_variavel,
              folga_fixa_dow: vigente.folga_fixa_dow,
              dias: normalizarDias(
                ((vigente as unknown as { dias?: DiaConfig[] }).dias ?? []).map((x) => ({
                  dow: x.dow,
                  trabalha: x.trabalha,
                  turno_id: x.turno_id ?? null,
                })),
                vigente.folga_variavel ? null : vigente.folga_fixa_dow,
              ),
            }
          : null;
        return { id: c.id, nome: c.nome, regime: c.regime, config };
      });
  }, [base.data, unidadeId, inicio, fim]);

  const ausencias: AusenciaIntervalo[] = useMemo(
    () =>
      (base.data?.ferias ?? [])
        .filter((f) => f.status !== "cancelado")
        .map((f) => ({
          colaborador_id: f.colaborador_id,
          inicio: f.data_inicio,
          fim: f.data_fim,
          tipo: "ferias" as const,
        })),
    [base.data],
  );

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["dp_escala_mes"] });
    qc.invalidateQueries({ queryKey: ["dp_escala_itens"] });
  };

  async function garantirEscala(): Promise<string> {
    if (escalaId) return escalaId;
    if (!selectedCompanyId) throw new Error("Selecione uma empresa.");
    const { data: userData } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from("dp_escalas")
      .insert({
        company_id: selectedCompanyId,
        unidade_id: unidadeId,
        competencia,
        created_by: userData.user?.id ?? null,
      })
      .select("id")
      .single();
    if (error) throw error;
    return data.id;
  }

  /** Regenera a escala do mês a partir das configurações, preservando ajustes manuais. */
  const gerar = useMutation({
    mutationFn: async (opts?: { preservarManuais?: boolean }) => {
      const id = await garantirEscala();
      const preservar =
        opts?.preservarManuais === false ? [] : (itens.data ?? []).map(linhaParaItem);

      const propostos = gerarEscalaMes({ competencia, colaboradores, turnos, ausencias, preservar });

      const { error: errDel } = await supabase.from("dp_escala_itens").delete().eq("escala_id", id);
      if (errDel) throw errDel;

      if (propostos.length) {
        const linhas = propostos.map((i) => ({
          company_id: selectedCompanyId!,
          escala_id: id,
          colaborador_id: i.colaborador_id,
          data: i.data,
          tipo: i.tipo,
          turno_id: i.turno_id,
          entrada: i.entrada,
          saida: i.saida,
          intervalo_minutos: i.intervalo_minutos,
          termina_no_dia_seguinte: i.termina_no_dia_seguinte,
          carga_prevista_horas: i.carga_prevista_horas,
          origem: i.origem,
          observacao: i.observacao ?? null,
        }));
        for (let i = 0; i < linhas.length; i += 500) {
          const { error } = await supabase.from("dp_escala_itens").insert(linhas.slice(i, i + 500));
          if (error) throw error;
        }
      }
      return propostos.length;
    },
    onSuccess: invalidate,
  });

  /** Ajuste manual de um dia: troca de turno ou marcação de folga. */
  const ajustarDia = useMutation({
    mutationFn: async (item: EscalaItem) => {
      const id = await garantirEscala();
      const { error } = await supabase.from("dp_escala_itens").upsert(
        {
          company_id: selectedCompanyId!,
          escala_id: id,
          colaborador_id: item.colaborador_id,
          data: item.data,
          tipo: item.tipo,
          turno_id: item.turno_id,
          entrada: item.entrada,
          saida: item.saida,
          intervalo_minutos: item.intervalo_minutos,
          termina_no_dia_seguinte: item.termina_no_dia_seguinte,
          carga_prevista_horas: item.carga_prevista_horas,
          origem: "manual",
          observacao: item.observacao ?? null,
        },
        { onConflict: "escala_id,colaborador_id,data" },
      );
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const publicar = useMutation({
    mutationFn: async () => {
      const id = await garantirEscala();
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("dp_escalas")
        .update({
          status: "publicada",
          publicada_em: new Date().toISOString(),
          publicada_por: userData.user?.id ?? null,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const reabrir = useMutation({
    mutationFn: async () => {
      if (!escalaId) return;
      const { error } = await supabase
        .from("dp_escalas")
        .update({ status: "rascunho", publicada_em: null, publicada_por: null })
        .eq("id", escalaId);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return {
    escala: escala.data ?? null,
    itens: (itens.data ?? []).map(linhaParaItem),
    colaboradores,
    turnos,
    ausencias,
    dias: useMemo(() => diasDaCompetencia(competencia), [competencia]),
    isLoading: escala.isLoading || base.isLoading || itens.isLoading,
    error: escala.error ?? base.error ?? itens.error,
    gerar,
    ajustarDia,
    publicar,
    reabrir,
  };
}
