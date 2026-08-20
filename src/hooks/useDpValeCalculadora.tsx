import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import {
  DIA_PAGAMENTO_PADRAO,
  DIAS_CORTE_PADRAO,
  REGRAS_DESCONTO_PADRAO,
  calcularVaDeposito,
  contarDiasDescontaveis,
  contarDiasPrevistos,
  diasDoIntervalo,
  dowDe,
  periodoVaDe,
  type DepositoVa,
  type DiasDescontaveisResultado,
  type MotivoDesconto,
  type RegrasDescontoVa,
} from "@/lib/dp/va-calculo";

/** Benefício pago por dia com data de corte. */
export type ValeTipo = "va" | "vt";

export const VALE_LABEL: Record<ValeTipo, string> = {
  va: "Vale-alimentação",
  vt: "Vale-transporte",
};

export interface LinhaVale {
  colaborador_id: string;
  nome: string;
  unidade_nome: string | null;
  valorDia: number;
  diasPrevistos: number;
  origemPrevistos: "escala" | "jornada";
  folgasDescontadas: number;
  folgasPendentes: number;
  descontos: DiasDescontaveisResultado;
  deposito: DepositoVa;
  /** Sem valor por dia cadastrado não há como calcular. */
  semValorDia: boolean;
}

export interface ResumoVale {
  periodo: ReturnType<typeof periodoVaDe>;
  linhas: LinhaVale[];
  total: number;
  totalDias: number;
  totalDescontados: number;
  porMotivo: Record<MotivoDesconto, number>;
}

const mesIso = (competencia: string) => `${competencia.slice(0, 7)}-01`;

/** Limite legal do desconto de vale-transporte (art. 4º, Lei 7.418/85). */
const VT_DESCONTO_MAXIMO = 0.06;

const COLUNAS: Record<ValeTipo, { config: string; colaborador: string; flag: string }> = {
  va: {
    config:
      "va_dia_pagamento, va_dias_corte, va_desconta_falta, va_desconta_folga_extra, va_desconta_atestado, va_desconta_ferias",
    colaborador:
      "vale_alimentacao, vale_alimentacao_valor, vale_alimentacao_periodicidade, vale_alimentacao_dias_base, vale_alimentacao_desconto_tipo, vale_alimentacao_desconto_valor, vale_alimentacao_dia_pagamento, vale_alimentacao_dias_corte, vale_alimentacao_desconta_falta, vale_alimentacao_desconta_folga_extra, vale_alimentacao_desconta_atestado, vale_alimentacao_desconta_ferias",
    flag: "vale_alimentacao",
  },
  vt: {
    config:
      "vt_dia_pagamento, vt_dias_corte, vt_desconta_falta, vt_desconta_folga_extra, vt_desconta_atestado, vt_desconta_ferias",
    colaborador:
      "vale_transporte, vale_transporte_valor_dia, vale_transporte_dia_pagamento, vale_transporte_dias_corte, vale_transporte_desconta_falta, vale_transporte_desconta_folga_extra, vale_transporte_desconta_atestado, vale_transporte_desconta_ferias, salario_base, valor_hora, base_salarial, forma_pagamento",
    flag: "vale_transporte",
  },
};

/**
 * Calculadora de vales pagos por dia (alimentação e transporte): reúne jornada,
 * escala publicada, folgas, ponto e férias para dizer quanto depositar no mês
 * por colaborador, respeitando o dia de pagamento e a data de corte.
 */
export function useDpValeCalculadora(
  tipo: ValeTipo,
  competencia: string,
  unidadeFilter = "todas",
) {
  const { selectedCompanyId } = useCompanyContext();
  const mes = mesIso(competencia);
  const cols = COLUNAS[tipo];
  const p = tipo === "va" ? "vale_alimentacao" : "vale_transporte";
  const cp = tipo === "va" ? "va" : "vt";

  const configQ = useQuery({
    queryKey: ["dp_config_dp_vale", tipo, selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dp_config_dp")
        .select(cols.config)
        .eq("company_id", selectedCompanyId!)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as Record<string, any> | null;
    },
  });

  const cfg = configQ.data ?? {};
  const padraoEmpresa = {
    diaPagamento: cfg[`${cp}_dia_pagamento`] ?? DIA_PAGAMENTO_PADRAO,
    diasCorte: cfg[`${cp}_dias_corte`] ?? DIAS_CORTE_PADRAO,
    regras: {
      falta: cfg[`${cp}_desconta_falta`] ?? REGRAS_DESCONTO_PADRAO.falta,
      folga_extra: cfg[`${cp}_desconta_folga_extra`] ?? REGRAS_DESCONTO_PADRAO.folga_extra,
      atestado: cfg[`${cp}_desconta_atestado`] ?? REGRAS_DESCONTO_PADRAO.atestado,
      ferias: cfg[`${cp}_desconta_ferias`] ?? REGRAS_DESCONTO_PADRAO.ferias,
    } as RegrasDescontoVa,
  };

  // Janela ampla: cobre a conferência do período anterior e a cobertura futura.
  const periodoEmpresa = periodoVaDe(padraoEmpresa.diaPagamento, padraoEmpresa.diasCorte, mes);
  const janelaInicio = periodoEmpresa.conferencia.inicio;
  const janelaFim = periodoEmpresa.cobertura.fim;

  const colabQ = useQuery({
    queryKey: ["dp_vale_colaboradores", tipo, selectedCompanyId, unidadeFilter],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      let q = supabase
        .from("dp_colaboradores")
        .select(`id, nome, ativo, data_desligamento, unidade_id, ${cols.colaborador}, dp_unidades(nome)`)
        .eq("company_id", selectedCompanyId!)
        .eq(cols.flag, true)
        .order("nome");
      if (unidadeFilter !== "todas") q = q.eq("unidade_id", unidadeFilter);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const colabIds = (colabQ.data ?? []).map((c) => c.id);

  const eventosQ = useQuery({
    queryKey: [
      "dp_vale_eventos",
      selectedCompanyId,
      janelaInicio,
      janelaFim,
      colabIds.length,
      unidadeFilter,
      tipo,
    ],
    enabled: !!selectedCompanyId && colabIds.length > 0,
    queryFn: async () => {
      const [config, dias, escala, folgas, pontos, ferias] = await Promise.all([
        supabase
          .from("dp_colaborador_config_trabalho")
          .select("id, colaborador_id, vigencia_inicio, vigencia_fim")
          .eq("company_id", selectedCompanyId!)
          .in("colaborador_id", colabIds),
        supabase
          .from("dp_colaborador_config_dias")
          .select("config_id, dow, trabalha")
          .eq("company_id", selectedCompanyId!),
        supabase
          .from("dp_escala_itens")
          .select("colaborador_id, data, tipo")
          .eq("company_id", selectedCompanyId!)
          .in("colaborador_id", colabIds)
          .gte("data", janelaInicio)
          .lte("data", janelaFim),
        supabase
          .from("dp_folgas")
          .select("colaborador_id, data, tipo, extra, status")
          .eq("company_id", selectedCompanyId!)
          .in("colaborador_id", colabIds)
          .gte("data", janelaInicio)
          .lte("data", janelaFim),
        supabase
          .from("dp_pontos")
          .select("colaborador_id, data")
          .eq("company_id", selectedCompanyId!)
          .in("colaborador_id", colabIds)
          .gte("data", janelaInicio)
          .lte("data", janelaFim),
        supabase
          .from("dp_ferias_gozos")
          .select("colaborador_id, data_inicio, data_fim, status")
          .eq("company_id", selectedCompanyId!)
          .in("colaborador_id", colabIds)
          .lte("data_inicio", janelaFim)
          .gte("data_fim", janelaInicio),
      ]);
      const erro = [config, dias, escala, folgas, pontos, ferias].find((r) => r.error)?.error;
      if (erro) throw erro;
      return {
        config: (config.data ?? []) as any[],
        dias: (dias.data ?? []) as any[],
        escala: (escala.data ?? []) as any[],
        folgas: (folgas.data ?? []) as any[],
        pontos: (pontos.data ?? []) as any[],
        ferias: (ferias.data ?? []) as any[],
      };
    },
  });

  const resumo = useMemo<ResumoVale>(() => {
    const colaboradores = (colabQ.data ?? []).filter(
      (c) => c.ativo !== false && (!c.data_desligamento || c.data_desligamento >= janelaInicio),
    );
    const ev = eventosQ.data;

    const dowPorConfig = new Map<string, number[]>();
    for (const d of ev?.dias ?? []) {
      if (!d.trabalha) continue;
      const atual = dowPorConfig.get(d.config_id) ?? [];
      atual.push(Number(d.dow));
      dowPorConfig.set(d.config_id, atual);
    }
    const dowPorColab = new Map<string, number[]>();
    for (const c of ev?.config ?? []) {
      const dows = dowPorConfig.get(c.id);
      if (dows?.length) dowPorColab.set(c.colaborador_id, dows);
    }

    const agrupar = <T extends { colaborador_id: string }>(rows: T[]) => {
      const m = new Map<string, T[]>();
      for (const r of rows) m.set(r.colaborador_id, [...(m.get(r.colaborador_id) ?? []), r]);
      return m;
    };
    const escalaPor = agrupar(ev?.escala ?? []);
    const folgasPor = agrupar(ev?.folgas ?? []);
    const pontosPor = agrupar(ev?.pontos ?? []);
    const feriasPor = agrupar(ev?.ferias ?? []);

    const linhas: LinhaVale[] = colaboradores.map((c) => {
      const diaPagamento = c[`${p}_dia_pagamento`] ?? padraoEmpresa.diaPagamento;
      const diasCorte = c[`${p}_dias_corte`] ?? padraoEmpresa.diasCorte;
      const periodo = periodoVaDe(diaPagamento, diasCorte, mes);
      const regras: RegrasDescontoVa = {
        falta: c[`${p}_desconta_falta`] ?? padraoEmpresa.regras.falta,
        folga_extra: c[`${p}_desconta_folga_extra`] ?? padraoEmpresa.regras.folga_extra,
        atestado: c[`${p}_desconta_atestado`] ?? padraoEmpresa.regras.atestado,
        ferias: c[`${p}_desconta_ferias`] ?? padraoEmpresa.regras.ferias,
      };

      const dowTrabalhados = dowPorColab.get(c.id) ?? [1, 2, 3, 4, 5];
      const escala = (escalaPor.get(c.id) ?? []).map((e) => ({ data: e.data, tipo: String(e.tipo) }));
      const folgas = (folgasPor.get(c.id) ?? []).map((f) => ({
        data: f.data,
        tipo: String(f.tipo),
        extra: f.extra,
        status: f.status ? String(f.status) : null,
      }));

      const previstos = contarDiasPrevistos({
        periodo: periodo.cobertura,
        escala,
        dowTrabalhados,
        folgas,
      });

      const escalaConf = escala.filter(
        (e) => e.data >= periodo.conferencia.inicio && e.data <= periodo.conferencia.fim,
      );
      const previstosConferencia = escalaConf.length
        ? escalaConf.filter((e) => e.tipo === "trabalho").map((e) => e.data)
        : diasDoIntervalo(periodo.conferencia.inicio, periodo.conferencia.fim).filter((d) =>
            dowTrabalhados.includes(dowDe(d)),
          );

      const pontos = pontosPor.get(c.id) ?? [];
      const descontos = contarDiasDescontaveis({
        periodo: periodo.conferencia,
        regras,
        diasPrevistos: previstosConferencia,
        diasComPonto: pontos.map((pt) => pt.data),
        usaPonto: pontos.length > 0,
        folgas,
        ferias: (feriasPor.get(c.id) ?? [])
          .filter((f) => !f.status || f.status !== "cancelado")
          .map((f) => ({ inicio: f.data_inicio, fim: f.data_fim })),
      });

      let valorDia: number;
      let descontoColaborador: number;

      if (tipo === "va") {
        const valorMes = Number(c.vale_alimentacao_valor ?? 0);
        valorDia =
          c.vale_alimentacao_periodicidade === "diario"
            ? valorMes
            : valorMes / Math.max(1, Number(c.vale_alimentacao_dias_base ?? 22));
        const diasPagos = Math.max(0, previstos.dias - descontos.dias);
        descontoColaborador =
          c.vale_alimentacao_desconto_tipo === "percentual"
            ? (valorDia * diasPagos * Number(c.vale_alimentacao_desconto_valor ?? 0)) / 100
            : c.vale_alimentacao_desconto_tipo === "valor"
              ? Number(c.vale_alimentacao_desconto_valor ?? 0)
              : 0;
      } else {
        valorDia = Number(c.vale_transporte_valor_dia ?? 0);
        // Desconto legal do VT: até 6% do salário base do colaborador.
        const salario = Number(c.base_salarial ?? 0) || Number(c.salario_base ?? 0);
        descontoColaborador = salario > 0 ? salario * VT_DESCONTO_MAXIMO : 0;
      }

      const deposito = calcularVaDeposito({
        diasPrevistos: previstos.dias,
        diasDescontados: descontos.dias,
        valorDia,
        descontoColaborador,
      });

      return {
        colaborador_id: c.id,
        nome: c.nome,
        unidade_nome: c.dp_unidades?.nome ?? null,
        valorDia: Math.round(valorDia * 100) / 100,
        diasPrevistos: previstos.dias,
        origemPrevistos: previstos.origem,
        folgasDescontadas: previstos.folgasDescontadas,
        folgasPendentes: previstos.folgasPendentes,
        descontos,
        deposito,
        semValorDia: !(valorDia > 0),
      };
    });

    const porMotivo: Record<MotivoDesconto, number> = { falta: 0, folga_extra: 0, atestado: 0, ferias: 0 };
    for (const l of linhas) {
      for (const k of Object.keys(porMotivo) as MotivoDesconto[]) porMotivo[k] += l.descontos.porMotivo[k];
    }

    return {
      periodo: periodoEmpresa,
      linhas,
      total: Math.round(linhas.reduce((s, l) => s + l.deposito.depositar, 0) * 100) / 100,
      totalDias: linhas.reduce((s, l) => s + l.deposito.diasPagos, 0),
      totalDescontados: linhas.reduce((s, l) => s + l.descontos.dias, 0),
      porMotivo,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colabQ.data, eventosQ.data, mes, janelaInicio, configQ.data, tipo]);

  return {
    ...resumo,
    padraoEmpresa,
    isLoading: configQ.isLoading || colabQ.isLoading || eventosQ.isLoading,
    isError: configQ.isError || colabQ.isError || eventosQ.isError,
    refetchAll: () => {
      void configQ.refetch();
      void colabQ.refetch();
      void eventosQ.refetch();
    },
  };
}
