// ------------------------------------------------------------------
// Analytics — Pessoas 360° · pontos de atenção
//
// Regras determinísticas, sem IA e sem causalidade: o texto descreve o que os
// dados mostram ("houve aumento", "também ficaram abaixo"), nunca por quê.
// ------------------------------------------------------------------

import { DOW_PLURAL, type LinhaOperacao } from "./operacao";

export interface PontoAtencao {
  id: string;
  texto: string;
  /** De onde o número saiu, para o gestor conferir. */
  origem: string;
  /** Rota de detalhe, quando existir. */
  para?: string;
  tom: "atencao" | "neutro";
}

export interface EntradaInsights {
  periodoLabel: string;
  /** Dias da semana já agregados na aba Operação. */
  operacaoPorDow: readonly LinhaOperacao[];
  diasAbaixo: number;
  feriasProximasDoPrazo: number;
  feriasVencidas: number;
  /** Dias com mão de obra extra por dia da semana. */
  extrasPorDiaSemana: readonly number[];
  aceiteConvocacoes: number | null;
  aceiteConvocacoesAnterior: number | null;
  ocorrenciasConfirmadas: number;
  ocorrenciasAnteriores: number;
  diasAfastamento: number;
  diasAfastamentoAnterior: number;
  /** Dias com férias programadas que também ficaram abaixo do habitual. */
  diasFeriasAbaixo: number;
}

export function montarPontosAtencao(e: EntradaInsights): PontoAtencao[] {
  const out: PontoAtencao[] = [];

  const piorDow = [...e.operacaoPorDow]
    .filter((l) => l.diasAnalisados >= 3 && l.percentualAbaixo >= 40)
    .sort((a, b) => b.percentualAbaixo - a.percentualAbaixo)[0];
  if (piorDow) {
    out.push({
      id: "operacao-dow",
      texto: `A equipe ficou abaixo do quadro habitual em ${piorDow.percentualAbaixo}% dos ${piorDow.label.toLowerCase()}s analisados.`,
      origem: `Operação · ${e.periodoLabel}`,
      para: "operacao",
      tom: "atencao",
    });
  }

  const maiorExtra = e.extrasPorDiaSemana.reduce(
    (acc, total, dow) => (total > acc.total ? { dow, total } : acc),
    { dow: -1, total: 0 },
  );
  if (maiorExtra.total >= 3) {
    out.push({
      id: "extras-dow",
      texto: `Mão de obra extra foi utilizada com mais frequência nos ${DOW_PLURAL[maiorExtra.dow]} (${maiorExtra.total} utilizações).`,
      origem: `Operação · ${e.periodoLabel}`,
      para: "operacao",
      tom: "neutro",
    });
  }

  if (e.feriasVencidas > 0) {
    out.push({
      id: "ferias-vencidas",
      texto: `${e.feriasVencidas} ${e.feriasVencidas === 1 ? "período de férias está" : "períodos de férias estão"} com o prazo vencido.`,
      origem: "Férias · situação atual",
      para: "ferias",
      tom: "atencao",
    });
  }
  if (e.feriasProximasDoPrazo > 0) {
    out.push({
      id: "ferias-prazo",
      texto: `${e.feriasProximasDoPrazo} ${e.feriasProximasDoPrazo === 1 ? "colaborador tem férias" : "colaboradores têm férias"} com prazo terminando nos próximos 30 dias.`,
      origem: "Férias · situação atual",
      para: "ferias",
      tom: "atencao",
    });
  }

  if (
    e.aceiteConvocacoes != null &&
    e.aceiteConvocacoesAnterior != null &&
    e.aceiteConvocacoesAnterior - e.aceiteConvocacoes >= 10
  ) {
    out.push({
      id: "aceite-convocacoes",
      texto: `A taxa de aceite das convocações caiu de ${e.aceiteConvocacoesAnterior}% para ${e.aceiteConvocacoes}%.`,
      origem: `Convocações · ${e.periodoLabel}`,
      para: "convocacoes",
      tom: "atencao",
    });
  }

  if (e.ocorrenciasConfirmadas > e.ocorrenciasAnteriores && e.ocorrenciasConfirmadas >= 3) {
    out.push({
      id: "ocorrencias",
      texto: `Ocorrências confirmadas aumentaram: ${e.ocorrenciasConfirmadas} no período contra ${e.ocorrenciasAnteriores} no período anterior.`,
      origem: `Ausências e ocorrências · ${e.periodoLabel}`,
      para: "ausencias",
      tom: "neutro",
    });
  }

  if (e.diasAfastamento > e.diasAfastamentoAnterior && e.diasAfastamento >= 5) {
    out.push({
      id: "afastamento",
      texto: `Houve aumento de dias de afastamento por atestado: ${e.diasAfastamento} contra ${e.diasAfastamentoAnterior} no período anterior.`,
      origem: `Ausências e ocorrências · ${e.periodoLabel}`,
      para: "ausencias",
      tom: "neutro",
    });
  }

  if (e.diasFeriasAbaixo > 0) {
    out.push({
      id: "ferias-operacao",
      texto: `${e.diasFeriasAbaixo} ${e.diasFeriasAbaixo === 1 ? "dia" : "dias"} com férias programadas também ${e.diasFeriasAbaixo === 1 ? "ficou" : "ficaram"} com a equipe abaixo do habitual.`,
      origem: `Férias e Operação · ${e.periodoLabel}`,
      para: "ferias",
      tom: "neutro",
    });
  }

  return out;
}
