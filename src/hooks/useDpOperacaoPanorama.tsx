import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import type { ConfigTrabalho, DiaConfig, TurnoResolvido } from "@/lib/dp/config-trabalho";
import { normalizarDias } from "@/lib/dp/config-trabalho";
import {
  avaliarDia,
  baselinePorDow,
  contarDia,
  diasDaCompetencia,
  somarDias,
  SEMANAS_BASELINE,
  type AusenciaPanorama,
  type AvaliacaoDia,
  type ColaboradorPanorama,
  type ConvocacaoPanorama,
  type FolgaPanorama,
  type ItemEscalaPanorama,
  type ResultadoDia,
} from "@/lib/dp/operacao-panorama";
import { isSocio } from "@/lib/dp/contrato-policy";
import type { HorarioFuncionamentoDia } from "@/lib/dp/turno-utils";

export interface DiaPanorama extends ResultadoDia {
  avaliacao: AvaliacaoDia;
  /** Alerta já marcado como resolvido pelo gestor. */
  dispensado: boolean;
  /** Há desvio relevante e ainda não dispensado. */
  alerta: boolean;
}

const DISPENSA_SENTINELA = "00000000-0000-0000-0000-000000000000";

/**
 * Painel da operação: lê jornada habitual, folgas, convocações, férias e
 * atestados e devolve as contagens por dia, com padrão histórico por dia da
 * semana e o controle de alertas dispensados.
 */
export function useDpOperacaoPanorama(competencia: string, unidadeId: string | null) {
  const { selectedCompanyId } = useCompanyContext();
  const qc = useQueryClient();

  const dias = useMemo(() => diasDaCompetencia(competencia), [competencia]);
  const inicio = dias[0] ?? `${competencia}-01`;
  const fim = dias[dias.length - 1] ?? `${competencia}-28`;
  const janelaInicio = useMemo(() => somarDias(inicio, -SEMANAS_BASELINE * 7), [inicio]);

  const base = useQuery({
    queryKey: ["dp_panorama_base", selectedCompanyId, competencia, unidadeId],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const [
        colabs,
        turnosRes,
        configs,
        ferias,
        folgas,
        convocacoes,
        atestados,
        escalas,
        unidades,
        cargos,
        funcionamento,
      ] =
        await Promise.all([
          supabase
            .from("dp_colaboradores")
            .select(
              "id, nome, regime, vinculo_label, unidade_id, cargo_id, ativo, data_admissao, data_desligamento",
            )
            .eq("company_id", selectedCompanyId!)
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
            .gte("data_fim", janelaInicio),
          supabase
            .from("dp_folgas")
            .select("colaborador_id, data, tipo, extra, status")
            .eq("company_id", selectedCompanyId!)
            .neq("status", "cancelada")
            .gte("data", janelaInicio)
            .lte("data", fim),
          supabase
            .from("dp_convocacoes")
            .select("colaborador_id, data, status, turno_id, entrada, saida, intervalo_minutos, unidade_id")
            .eq("company_id", selectedCompanyId!)
            .in("status", ["pendente", "aceita"])
            .gte("data", janelaInicio)
            .lte("data", fim),
          supabase
            .from("dp_solicitacoes")
            .select("colaborador_id, tipo, status, data_alvo, data_fim")
            .eq("company_id", selectedCompanyId!)
            .eq("tipo", "atestado")
            .eq("status", "aprovada"),
          supabase
            .from("dp_escalas")
            .select("id, unidade_id, competencia, status")
            .eq("company_id", selectedCompanyId!)
            .eq("status", "publicada")
            .gte("competencia", janelaInicio.slice(0, 7))
            .lte("competencia", competencia),
          supabase
            .from("dp_unidades")
            .select("id, nome, ativo")
            .eq("company_id", selectedCompanyId!)
            .order("nome"),
          supabase.from("dp_cargos").select("id, nome").eq("company_id", selectedCompanyId!),
          supabase
            .from("dp_unidade_horarios_funcionamento")
            .select("unidade_id, dia_semana, aberto, hora_abertura, hora_fechamento, nome, ordem")
            .eq("company_id", selectedCompanyId!)
            .order("dia_semana")
            .order("ordem"),
        ]);

      const err = [
        colabs,
        turnosRes,
        configs,
        ferias,
        folgas,
        convocacoes,
        atestados,
        escalas,
        unidades,
        cargos,
        funcionamento,
      ].find((r) => r.error);
      if (err?.error) throw err.error;

      const escalaIds = (escalas.data ?? [])
        .filter((e) => !unidadeId || e.unidade_id === unidadeId || e.unidade_id === null)
        .map((e) => e.id);

      let itens: ItemEscalaPanorama[] = [];
      if (escalaIds.length) {
        const { data, error } = await supabase
          .from("dp_escala_itens")
          .select("colaborador_id, data, tipo, turno_id, entrada, saida, intervalo_minutos")
          .in("escala_id", escalaIds)
          .gte("data", janelaInicio)
          .lte("data", fim);
        if (error) throw error;
        itens = (data ?? []).map((i) => ({
          colaborador_id: i.colaborador_id,
          data: i.data,
          tipo: i.tipo,
          turno_id: i.turno_id,
          entrada: i.entrada,
          saida: i.saida,
          intervalo_minutos: i.intervalo_minutos,
        }));
      }

      return {
        colaboradores: colabs.data ?? [],
        turnos: turnosRes.data ?? [],
        configs: configs.data ?? [],
        ferias: ferias.data ?? [],
        folgas: folgas.data ?? [],
        convocacoes: convocacoes.data ?? [],
        atestados: atestados.data ?? [],
        unidades: unidades.data ?? [],
        cargos: cargos.data ?? [],
        funcionamento: funcionamento.data ?? [],
        itens,
      };
    },
  });

  const dispensas = useQuery({
    queryKey: ["dp_panorama_dispensas", selectedCompanyId, competencia, unidadeId],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      let q = supabase
        .from("dp_operacao_alertas_dispensas")
        .select("data, unidade_id, previsto_snapshot, padrao_snapshot, observacao")
        .eq("company_id", selectedCompanyId!)
        .gte("data", inicio)
        .lte("data", fim);
      q = unidadeId ? q.eq("unidade_id", unidadeId) : q.is("unidade_id", null);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

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

  const colaboradores: ColaboradorPanorama[] = useMemo(() => {
    const d = base.data;
    if (!d) return [];
    return d.colaboradores
      .filter((c) => !unidadeId || c.unidade_id === unidadeId)
      .map((c) => {
        const cargoNome = d.cargos.find((x) => x.id === c.cargo_id)?.nome ?? null;
        const vigente = d.configs.find(
          (cfg) =>
            cfg.colaborador_id === c.id &&
            cfg.vigencia_inicio <= fim &&
            (!cfg.vigencia_fim || cfg.vigencia_fim >= janelaInicio),
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
        return {
          id: c.id,
          nome: c.nome,
          regime: c.regime,
          unidade_id: c.unidade_id,
          intermitente: c.regime === "intermitente" || c.regime === "freelancer",
          config,
          cargo_id: c.cargo_id,
          cargo_nome: cargoNome,
          socio: isSocio((c as { vinculo_label?: string | null }).vinculo_label),
          ativo: c.ativo !== false,
          data_admissao: c.data_admissao,
          data_desligamento: c.data_desligamento,
        };
      });
  }, [base.data, unidadeId, fim, janelaInicio]);

  const ausencias: AusenciaPanorama[] = useMemo(() => {
    const d = base.data;
    if (!d) return [];
    const deFerias: AusenciaPanorama[] = d.ferias
      .filter((f) => f.status !== "cancelado")
      .map((f) => ({
        colaborador_id: f.colaborador_id,
        inicio: f.data_inicio,
        fim: f.data_fim,
        tipo: "ferias" as const,
      }));
    const deAtestado: AusenciaPanorama[] = d.atestados
      .filter((a) => !!a.data_alvo)
      .map((a) => ({
        colaborador_id: a.colaborador_id,
        inicio: a.data_alvo!,
        fim: a.data_fim ?? a.data_alvo!,
        tipo: "atestado" as const,
      }));
    return [...deFerias, ...deAtestado];
  }, [base.data]);

  const folgas: FolgaPanorama[] = useMemo(
    () =>
      (base.data?.folgas ?? []).map((f) => ({
        colaborador_id: f.colaborador_id,
        data: f.data,
        tipo: f.tipo,
        extra: f.extra,
      })),
    [base.data],
  );

  const convocacoes: ConvocacaoPanorama[] = useMemo(
    () =>
      (base.data?.convocacoes ?? [])
        .filter((c) => !unidadeId || c.unidade_id === unidadeId || c.unidade_id === null)
        .map((c) => ({
          colaborador_id: c.colaborador_id,
          data: c.data,
          status: c.status as "pendente" | "aceita",
          turno_id: c.turno_id,
          entrada: c.entrada,
          saida: c.saida,
          intervalo_minutos: c.intervalo_minutos,
        })),
    [base.data, unidadeId],
  );

  /** Conta um dia respeitando admissão/desligamento do colaborador. */
  const contar = (data: string): ResultadoDia =>
    contarDia({
      data,
      colaboradores: colaboradores.filter(
        (c) =>
          (!c.data_admissao || c.data_admissao <= data) &&
          (!c.data_desligamento || c.data_desligamento >= data) &&
          (c.ativo || !!c.data_desligamento),
      ),
      turnos,
      convocacoes,
      folgas,
      ausencias,
      itensPublicados: base.data?.itens,
    });

  /** Histórico (janela anterior à competência) usado para aprender o padrão. */
  const historico = useMemo(() => {
    if (!base.data) return [] as { data: string; trabalhando: number }[];
    const out: { data: string; trabalhando: number }[] = [];
    let d = janelaInicio;
    while (d < inicio) {
      out.push({ data: d, trabalhando: contar(d).trabalhando });
      d = somarDias(d, 1);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base.data, colaboradores, turnos, convocacoes, folgas, ausencias, janelaInicio, inicio]);

  const padrao = useMemo(() => baselinePorDow(historico, { limite: inicio }), [historico, inicio]);

  const dispensadas = useMemo(
    () => new Set((dispensas.data ?? []).map((d) => d.data)),
    [dispensas.data],
  );

  const diasPanorama: DiaPanorama[] = useMemo(() => {
    if (!base.data) return [];
    return dias.map((data) => {
      const r = contar(data);
      const avaliacao = avaliarDia(r.trabalhando, padrao.get(r.dow));
      const dispensado = dispensadas.has(data);
      const desvio = avaliacao.situacao === "abaixo" || avaliacao.situacao === "acima";
      return { ...r, avaliacao, dispensado, alerta: desvio && !dispensado };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base.data, dias, padrao, dispensadas, colaboradores, turnos, convocacoes, folgas, ausencias]);

  const dispensarAlerta = useMutation({
    mutationFn: async (input: { data: string; previsto: number; padrao: number; observacao?: string }) => {
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase.from("dp_operacao_alertas_dispensas").upsert(
        {
          company_id: selectedCompanyId!,
          unidade_id: unidadeId,
          data: input.data,
          previsto_snapshot: input.previsto,
          padrao_snapshot: input.padrao,
          observacao: input.observacao ?? null,
          dispensado_por: userData.user?.id ?? null,
        },
        { onConflict: "company_id,unidade_id,data" },
      );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dp_panorama_dispensas"] }),
  });

  const reativarAlerta = useMutation({
    mutationFn: async (data: string) => {
      let q = supabase
        .from("dp_operacao_alertas_dispensas")
        .delete()
        .eq("company_id", selectedCompanyId!)
        .eq("data", data);
      q = unidadeId ? q.eq("unidade_id", unidadeId) : q.is("unidade_id", null);
      const { error } = await q;
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dp_panorama_dispensas"] }),
  });

  /** Funcionamento por unidade, no formato de períodos por dia da semana. */
  const funcionamentoPorUnidade = useMemo(() => {
    const out = new Map<string, HorarioFuncionamentoDia[]>();
    for (const r of base.data?.funcionamento ?? []) {
      const lista = out.get(r.unidade_id) ?? [];
      let dia = lista.find((d) => d.dia_semana === r.dia_semana);
      if (!dia) {
        dia = { dia_semana: r.dia_semana, aberto: false, periodos: [] };
        lista.push(dia);
      }
      dia.aberto = dia.aberto || r.aberto;
      if (r.aberto && (r.hora_abertura || r.hora_fechamento)) {
        dia.periodos!.push({
          nome: (r as { nome?: string | null }).nome ?? null,
          hora_abertura: r.hora_abertura ? r.hora_abertura.slice(0, 5) : null,
          hora_fechamento: r.hora_fechamento ? r.hora_fechamento.slice(0, 5) : null,
        });
      }
      out.set(r.unidade_id, lista);
    }
    return out;
  }, [base.data]);

  /** Colaboradores ativos por unidade — define a unidade padrão da tela. */
  const contagemPorUnidade = useMemo(() => {
    const out = new Map<string, number>();
    for (const c of base.data?.colaboradores ?? []) {
      if (c.ativo === false || !c.unidade_id) continue;
      out.set(c.unidade_id, (out.get(c.unidade_id) ?? 0) + 1);
    }
    return out;
  }, [base.data]);

  return {
    dias: diasPanorama,
    turnos,
    funcionamentoPorUnidade,
    contagemPorUnidade,
    colaboradores,
    unidades: (base.data?.unidades ?? []).filter((u) => u.ativo !== false),
    padrao,
    isLoading: base.isLoading,
    error: base.error,
    dispensarAlerta,
    reativarAlerta,
    diaDe: (data: string) => diasPanorama.find((d) => d.data === data) ?? null,
    contarData: contar,
    SENTINELA: DISPENSA_SENTINELA,
  };
}
