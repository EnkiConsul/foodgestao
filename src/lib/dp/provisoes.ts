// ------------------------------------------------------------------
// Domínio: DP → Provisões da folha (Fase 18)
//
// Cálculo de férias (com 1/3 constitucional, abono pecuniário e
// adiantamento do 13º) e do 13º salário em duas parcelas.
// Funções puras — devolvem rubricas prontas para o contracheque.
// ------------------------------------------------------------------

import type { RubricaExtra } from "./folha";

const round2 = (v: number) => Math.round(v * 100) / 100;

export const DIAS_MES_COMERCIAL = 30;
export const MAX_DIAS_ABONO = 10;

export interface FeriasInput {
  salarioBase: number;
  /** Dias de gozo (1 a 30). */
  diasGozo: number;
  /** Dias vendidos como abono pecuniário (0 a 10). */
  diasAbono?: number;
  /** Solicitou adiantamento da 1ª parcela do 13º junto das férias. */
  adiantar13?: boolean;
}

/**
 * Rubricas de um recibo de férias.
 * Férias e o 1/3 são tributáveis; abono pecuniário e adiantamento do
 * 13º não sofrem INSS/IRRF neste recibo.
 */
export function rubricasDeFerias(input: FeriasInput): RubricaExtra[] {
  const salario = Math.max(0, input.salarioBase);
  const diasGozo = Math.min(DIAS_MES_COMERCIAL, Math.max(0, Math.trunc(input.diasGozo)));
  const diasAbono = Math.min(MAX_DIAS_ABONO, Math.max(0, Math.trunc(input.diasAbono ?? 0)));
  if (salario <= 0 || (diasGozo <= 0 && diasAbono <= 0)) return [];

  const valorDia = salario / DIAS_MES_COMERCIAL;
  const rubricas: RubricaExtra[] = [];

  if (diasGozo > 0) {
    const ferias = round2(valorDia * diasGozo);
    rubricas.push({ descricao: `Férias (${diasGozo} dias)`, natureza: "provento", valor: ferias });
    rubricas.push({ descricao: "1/3 constitucional", natureza: "provento", valor: round2(ferias / 3) });
  }

  if (diasAbono > 0) {
    const abono = round2(valorDia * diasAbono);
    rubricas.push({
      descricao: `Abono pecuniário (${diasAbono} dias)`,
      natureza: "provento",
      valor: abono,
      tributavel: false,
    });
    rubricas.push({
      descricao: "1/3 sobre abono pecuniário",
      natureza: "provento",
      valor: round2(abono / 3),
      tributavel: false,
    });
  }

  if (input.adiantar13) {
    rubricas.push({
      descricao: "Adiantamento 13º (1ª parcela)",
      natureza: "provento",
      valor: round2(salario / 2),
      tributavel: false,
    });
  }

  return rubricas;
}

/** Dias de gozo entre duas datas ISO (inclusive), limitado a 30. */
export function diasDeGozo(dataInicio: string, dataFim: string): number {
  const inicio = new Date(`${dataInicio}T12:00:00`).getTime();
  const fim = new Date(`${dataFim}T12:00:00`).getTime();
  if (!Number.isFinite(inicio) || !Number.isFinite(fim) || fim < inicio) return 0;
  const dias = Math.round((fim - inicio) / 86400000) + 1;
  return Math.min(DIAS_MES_COMERCIAL, dias);
}

/**
 * Avos do 13º no ano: cada mês com 15 dias ou mais trabalhados vale 1/12.
 * `admissao` fora do ano é ignorada (conta o ano inteiro).
 */
export function avosDoDecimoTerceiro(ano: number, admissao?: string | null, desligamento?: string | null): number {
  let primeiroMes = 1;
  let ultimoMes = 12;

  if (admissao) {
    const d = new Date(`${admissao}T12:00:00`);
    if (d.getFullYear() > ano) return 0;
    if (d.getFullYear() === ano) {
      const diasNoMes = new Date(ano, d.getMonth() + 1, 0).getDate();
      const trabalhados = diasNoMes - d.getDate() + 1;
      primeiroMes = trabalhados >= 15 ? d.getMonth() + 1 : d.getMonth() + 2;
    }
  }

  if (desligamento) {
    const d = new Date(`${desligamento}T12:00:00`);
    if (d.getFullYear() < ano) return 0;
    if (d.getFullYear() === ano) {
      ultimoMes = d.getDate() >= 15 ? d.getMonth() + 1 : d.getMonth();
    }
  }

  return Math.max(0, Math.min(12, ultimoMes - primeiroMes + 1));
}

export interface DecimoInput {
  salarioBase: number;
  avos: number;
  /** 1ª parcela (adiantamento, sem encargos) ou 2ª parcela (com encargos). */
  parcela: 1 | 2;
  /** Valor já adiantado ao colaborador (descontado na 2ª parcela). */
  adiantamento?: number;
}

/** Rubricas do 13º salário conforme a parcela. */
export function rubricasDoDecimoTerceiro(input: DecimoInput): RubricaExtra[] {
  const salario = Math.max(0, input.salarioBase);
  const avos = Math.min(12, Math.max(0, Math.trunc(input.avos)));
  if (salario <= 0 || avos <= 0) return [];

  const integral = round2((salario / 12) * avos);

  if (input.parcela === 1) {
    return [
      {
        descricao: `13º salário — 1ª parcela (${avos}/12)`,
        natureza: "provento",
        valor: round2(integral / 2),
        tributavel: false,
      },
    ];
  }

  const rubricas: RubricaExtra[] = [
    { descricao: `13º salário (${avos}/12)`, natureza: "provento", valor: integral },
  ];
  const adiantado = round2(Math.min(integral, Math.max(0, input.adiantamento ?? 0)));
  if (adiantado > 0) {
    rubricas.push({ descricao: "Adiantamento 13º (1ª parcela)", natureza: "desconto", valor: adiantado });
  }
  return rubricas;
}
