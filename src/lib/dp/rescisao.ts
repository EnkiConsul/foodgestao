// ------------------------------------------------------------------
// Domínio: DP → Rescisão contratual / TRCT (Fase 19)
//
// Converte os dados do desligamento nas verbas rescisórias, já no
// formato de rubricas do contracheque. Funções puras.
//
// Convenções tributárias adotadas:
// - Saldo de salário e 13º proporcional entram na base de INSS/IRRF.
// - Aviso prévio indenizado, férias (vencidas/proporcionais), 1/3 e
//   multa do FGTS são indenizatórios (não tributáveis).
// ------------------------------------------------------------------

import type { RubricaExtra } from "./folha";
import { avosDoDecimoTerceiro } from "./provisoes";
import { parseDateOnly, type MotivoDesligamento } from "./desligamento";

const round2 = (v: number) => Math.round(v * 100) / 100;
const DIAS_MES = 30;

/** Motivos que dão direito às verbas indenizatórias completas. */
export function temDireitoAvisoIndenizado(motivo: MotivoDesligamento): boolean {
  return motivo === "dispensa_sem_justa_causa" || motivo === "termino_contrato" || motivo === "acordo_mutuo";
}

/** Justa causa e abandono não geram férias proporcionais nem 13º proporcional. */
export function temDireitoProporcionais(motivo: MotivoDesligamento): boolean {
  return motivo !== "dispensa_com_justa_causa" && motivo !== "abandono_emprego";
}

/** Percentual da multa do FGTS conforme o motivo (0 quando não há). */
export function percentualMultaFgts(motivo: MotivoDesligamento): number {
  if (motivo === "dispensa_sem_justa_causa") return 0.4;
  if (motivo === "acordo_mutuo") return 0.2;
  return 0;
}

/**
 * Dias de aviso prévio: 30 dias + 3 por ano completo de casa, limitado a 90.
 * No acordo mútuo o aviso indenizado é pago pela metade.
 */
export function diasDeAvisoPrevio(admissao: string, desligamento: string, motivo: MotivoDesligamento): number {
  if (!temDireitoAvisoIndenizado(motivo)) return 0;
  const anos = anosCompletos(admissao, desligamento);
  const dias = Math.min(90, 30 + anos * 3);
  return motivo === "acordo_mutuo" ? Math.round(dias / 2) : dias;
}

/** Anos completos entre admissão e desligamento. */
export function anosCompletos(admissao: string, desligamento: string): number {
  const a = parseDateOnly(admissao);
  const d = parseDateOnly(desligamento);
  let anos = d.getFullYear() - a.getFullYear();
  const antes = d.getMonth() < a.getMonth() || (d.getMonth() === a.getMonth() && d.getDate() < a.getDate());
  if (antes) anos -= 1;
  return Math.max(0, anos);
}

/** Avos de férias proporcionais no período aquisitivo em curso (meses com 15+ dias). */
export function avosFeriasProporcionais(admissao: string, desligamento: string): number {
  const a = parseDateOnly(admissao);
  const d = parseDateOnly(desligamento);
  if (d < a) return 0;
  const meses = (d.getFullYear() - a.getFullYear()) * 12 + (d.getMonth() - a.getMonth());
  const restoDias = d.getDate() - a.getDate() + 1;
  const avos = (meses % 12) + (restoDias >= 15 ? 1 : 0);
  return Math.max(0, Math.min(12, avos));
}

export interface RescisaoInput {
  salarioBase: number;
  admissao: string;
  desligamento: string;
  motivo: MotivoDesligamento;
  /** Dias de férias vencidas e não gozadas. */
  diasFeriasVencidas?: number;
  /** Saldo depositado de FGTS, usado para calcular a multa. */
  saldoFgts?: number;
  /** No pedido de demissão sem cumprimento, o aviso é descontado. */
  descontarAvisoNaoCumprido?: boolean;
}

/** Verbas rescisórias como rubricas do contracheque. */
export function verbasDaRescisao(input: RescisaoInput): RubricaExtra[] {
  const salario = Math.max(0, input.salarioBase);
  if (salario <= 0) return [];

  const dia = salario / DIAS_MES;
  const desligamento = parseDateOnly(input.desligamento);
  const ano = desligamento.getFullYear();
  const rubricas: RubricaExtra[] = [];

  // Saldo de salário: dias trabalhados no mês do desligamento.
  const diasTrabalhados = desligamento.getDate();
  rubricas.push({
    descricao: `Saldo de salário (${diasTrabalhados} dias)`,
    natureza: "provento",
    valor: round2(dia * diasTrabalhados),
  });

  // Aviso prévio indenizado.
  const diasAviso = diasDeAvisoPrevio(input.admissao, input.desligamento, input.motivo);
  if (diasAviso > 0) {
    rubricas.push({
      descricao: `Aviso prévio indenizado (${diasAviso} dias)`,
      natureza: "provento",
      valor: round2(dia * diasAviso),
      tributavel: false,
    });
  }

  // 13º proporcional.
  if (temDireitoProporcionais(input.motivo)) {
    const avos13 = avosDoDecimoTerceiro(ano, input.admissao, input.desligamento);
    if (avos13 > 0) {
      rubricas.push({
        descricao: `13º proporcional (${avos13}/12)`,
        natureza: "provento",
        valor: round2((salario / 12) * avos13),
      });
    }
  }

  // Férias vencidas + 1/3.
  const diasVencidas = Math.max(0, Math.trunc(input.diasFeriasVencidas ?? 0));
  if (diasVencidas > 0) {
    const vencidas = round2(dia * diasVencidas);
    rubricas.push({
      descricao: `Férias vencidas (${diasVencidas} dias)`,
      natureza: "provento",
      valor: vencidas,
      tributavel: false,
    });
    rubricas.push({
      descricao: "1/3 sobre férias vencidas",
      natureza: "provento",
      valor: round2(vencidas / 3),
      tributavel: false,
    });
  }

  // Férias proporcionais + 1/3.
  if (temDireitoProporcionais(input.motivo)) {
    const avosFerias = avosFeriasProporcionais(input.admissao, input.desligamento);
    if (avosFerias > 0) {
      const prop = round2((salario / 12) * avosFerias);
      rubricas.push({
        descricao: `Férias proporcionais (${avosFerias}/12)`,
        natureza: "provento",
        valor: prop,
        tributavel: false,
      });
      rubricas.push({
        descricao: "1/3 sobre férias proporcionais",
        natureza: "provento",
        valor: round2(prop / 3),
        tributavel: false,
      });
    }
  }

  // Multa do FGTS.
  const pct = percentualMultaFgts(input.motivo);
  const saldoFgts = Math.max(0, input.saldoFgts ?? 0);
  if (pct > 0 && saldoFgts > 0) {
    rubricas.push({
      descricao: `Multa do FGTS (${Math.round(pct * 100)}%)`,
      natureza: "provento",
      valor: round2(saldoFgts * pct),
      tributavel: false,
    });
  }

  // Aviso não cumprido no pedido de demissão.
  if (input.descontarAvisoNaoCumprido && input.motivo === "pedido_demissao") {
    rubricas.push({ descricao: "Aviso prévio não cumprido", natureza: "desconto", valor: round2(salario) });
  }

  return rubricas;
}
