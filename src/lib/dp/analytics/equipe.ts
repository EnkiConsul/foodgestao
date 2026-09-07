// ------------------------------------------------------------------
// Analytics — Pessoas 360° · Equipe (quadro, movimentação, permanência)
//
// Regra única do quadro, válida para todo o Analytics:
// a pessoa faz parte do quadro numa data quando foi admitida até aquela data
// e ainda não havia sido desligada ANTES dela — ou seja, o próprio dia do
// desligamento (último dia de contrato) ainda conta.
//
// Dimensões unidade/cargo/vínculo vêm do cadastro atual (SNAPSHOT ATUAL);
// não existe histórico dessas dimensões no cadastro, por isso as telas rotulam
// esses cortes como "situação atual do cadastro".
// ------------------------------------------------------------------

import {
  competenciasDoPeriodo,
  limitesDaCompetencia,
  type PeriodoAnalytics,
} from "./periodo";

export interface ColaboradorAnalytics {
  id: string;
  nome: string;
  unidade_id: string | null;
  cargo_id: string | null;
  setor_id: string | null;
  regime: string | null;
  vinculo_label?: string | null;
  data_admissao: string | null;
  data_desligamento: string | null;
  ativo?: boolean | null;
}

/** A pessoa fazia parte do quadro nesta data? */
export function noQuadroEm(c: ColaboradorAnalytics, data: string): boolean {
  if (!c.data_admissao || c.data_admissao > data) return false;
  if (c.data_desligamento && c.data_desligamento < data) return false;
  return true;
}

export function headcountEm(lista: readonly ColaboradorAnalytics[], data: string): number {
  return lista.reduce((s, c) => s + (noQuadroEm(c, data) ? 1 : 0), 0);
}

const dentro = (data: string | null, p: PeriodoAnalytics) =>
  !!data && data >= p.inicio && data <= p.fim;

export const admitidosNo = (lista: readonly ColaboradorAnalytics[], p: PeriodoAnalytics) =>
  lista.filter((c) => dentro(c.data_admissao, p));

export const desligadosNo = (lista: readonly ColaboradorAnalytics[], p: PeriodoAnalytics) =>
  lista.filter((c) => dentro(c.data_desligamento, p));

/** Média entre o quadro do primeiro e do último dia do período. */
export function headcountMedio(lista: readonly ColaboradorAnalytics[], p: PeriodoAnalytics): number {
  return (headcountEm(lista, p.inicio) + headcountEm(lista, p.fim)) / 2;
}

/**
 * Turnover do período — ((admissões + desligamentos) / 2) ÷ headcount médio × 100.
 * Fórmula única do Analytics; a série mensal usa a mesma conta mês a mês.
 */
export function turnoverPeriodo(lista: readonly ColaboradorAnalytics[], p: PeriodoAnalytics): number {
  const medio = headcountMedio(lista, p);
  if (medio <= 0) return 0;
  const adm = admitidosNo(lista, p).length;
  const des = desligadosNo(lista, p).length;
  return Number(((((adm + des) / 2) / medio) * 100).toFixed(1));
}

/** Desligamentos ÷ headcount médio × 100. */
export function taxaDesligamento(lista: readonly ColaboradorAnalytics[], p: PeriodoAnalytics): number {
  const medio = headcountMedio(lista, p);
  if (medio <= 0) return 0;
  return Number(((desligadosNo(lista, p).length / medio) * 100).toFixed(1));
}

export interface MesEquipe {
  competencia: string;
  label: string;
  headcount: number;
  admissoes: number;
  desligamentos: number;
  turnover: number;
}

const MES_CURTO = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export function serieMensal(
  lista: readonly ColaboradorAnalytics[],
  p: PeriodoAnalytics,
): MesEquipe[] {
  return competenciasDoPeriodo(p).map((comp) => {
    const mes = limitesDaCompetencia(comp);
    return {
      competencia: comp,
      label: `${MES_CURTO[Number(comp.slice(5, 7)) - 1]}/${comp.slice(2, 4)}`,
      headcount: headcountEm(lista, mes.fim),
      admissoes: admitidosNo(lista, mes).length,
      desligamentos: desligadosNo(lista, mes).length,
      turnover: turnoverPeriodo(lista, mes),
    };
  });
}

export interface FaixaPermanencia {
  faixa: string;
  total: number;
}

export interface ResumoPermanencia {
  /** Desligados no período com data de admissão preenchida. */
  considerados: number;
  semDataAdmissao: number;
  mediaDias: number | null;
  medianaDias: number | null;
  faixas: FaixaPermanencia[];
  /** Desligados com menos de 90 dias de casa. */
  ate90Dias: number;
  totalDesligados: number;
}

const FAIXAS: { faixa: string; ate: number }[] = [
  { faixa: "Até 30 dias", ate: 30 },
  { faixa: "31 a 90 dias", ate: 90 },
  { faixa: "91 a 180 dias", ate: 180 },
  { faixa: "181 a 365 dias", ate: 365 },
  { faixa: "Mais de 1 ano", ate: Infinity },
];

const dias = (a: string, b: string) =>
  Math.round(
    (new Date(`${b}T12:00:00`).getTime() - new Date(`${a}T12:00:00`).getTime()) / 86_400_000,
  );

export function permanencia(
  lista: readonly ColaboradorAnalytics[],
  p: PeriodoAnalytics,
): ResumoPermanencia {
  const desligados = desligadosNo(lista, p);
  const comData = desligados.filter((c) => !!c.data_admissao);
  const duracoes = comData
    .map((c) => dias(c.data_admissao!, c.data_desligamento!))
    .filter((d) => d >= 0)
    .sort((a, b) => a - b);

  const faixas = FAIXAS.map(({ faixa }) => ({ faixa, total: 0 }));
  duracoes.forEach((d) => {
    const idx = FAIXAS.findIndex((f) => d <= f.ate);
    faixas[idx === -1 ? FAIXAS.length - 1 : idx].total += 1;
  });

  const meio = Math.floor(duracoes.length / 2);
  return {
    considerados: duracoes.length,
    semDataAdmissao: desligados.length - comData.length,
    mediaDias: duracoes.length
      ? Math.round(duracoes.reduce((s, d) => s + d, 0) / duracoes.length)
      : null,
    medianaDias: duracoes.length
      ? duracoes.length % 2
        ? duracoes[meio]
        : Math.round((duracoes[meio - 1] + duracoes[meio]) / 2)
      : null,
    faixas,
    ate90Dias: duracoes.filter((d) => d <= 90).length,
    totalDesligados: desligados.length,
  };
}

export interface ItemDistribuicao {
  chave: string | null;
  label: string;
  total: number;
  percentual: number;
}

/** Distribuição genérica com "Não informado" para chaves nulas. */
export function distribuir<T>(
  itens: readonly T[],
  chaveDe: (item: T) => string | null,
  labelDe: (chave: string | null) => string,
): ItemDistribuicao[] {
  const mapa = new Map<string, number>();
  itens.forEach((i) => {
    const k = chaveDe(i) ?? "";
    mapa.set(k, (mapa.get(k) ?? 0) + 1);
  });
  const total = itens.length || 1;
  return [...mapa.entries()]
    .map(([k, qtd]) => ({
      chave: k || null,
      label: labelDe(k || null),
      total: qtd,
      percentual: Number(((qtd / total) * 100).toFixed(1)),
    }))
    .sort((a, b) => b.total - a.total);
}
