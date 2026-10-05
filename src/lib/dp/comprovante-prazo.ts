import { addDays, format } from "date-fns";
import { competenciaDe, limiteMesSeguinte, limiteNoMes } from "./pendencias-documentos";

/**
 * Prazo do comprovante de pagamento.
 *
 * O comprovante só pode existir depois do pagamento, então a cobrança parte da
 * data prevista de pagamento do documento — nunca da competência crua.
 */

/** Documentos de folha mensal: o pagamento cai no mês seguinte à competência. */
export const TIPOS_FOLHA_MES_SEGUINTE = new Set<string>([
  "contracheque",
  "contracheque_13",
  "pro_labore",
  "plr",
  "outros_pagamentos",
  // O rateio da gorjeta é pago junto com a folha do mês seguinte à competência.
  "gorjeta",
]);

/** Documentos rescisórios: pagamento em até 10 dias corridos do desligamento (Art. 477, §6º CLT). */
export const TIPOS_RESCISORIOS = new Set<string>([
  "desligamento",
  "trct",
  "demonstrativo_rescisorio",
  "acerto_rescisorio",
]);

export type ComprovantePrazoArgs = {
  tipo: string;
  /** Data de referência do documento (YYYY-MM-DD). */
  referencia: string;
  /** Dia do adiantamento cadastrado na unidade do colaborador. */
  diaAdiantamento?: number | null;
  /** Dia de pagamento da folha configurado nas pendências. */
  diaPagamentoFolha: number;
  /** Data de desligamento do colaborador (YYYY-MM-DD), para rescisórios. */
  dataDesligamento?: string | null;
};

/** Data prevista de pagamento (YYYY-MM-DD) do documento. */
export function pagamentoPrevisto(args: ComprovantePrazoArgs): string {
  const comp = competenciaDe(args.referencia);
  if (args.tipo === "adiantamento") {
    return args.diaAdiantamento ? limiteNoMes(comp, args.diaAdiantamento) : args.referencia;
  }
  if (TIPOS_FOLHA_MES_SEGUINTE.has(args.tipo)) {
    return limiteMesSeguinte(comp, args.diaPagamentoFolha);
  }
  if (TIPOS_RESCISORIOS.has(args.tipo)) {
    const base = (args.dataDesligamento || args.referencia).slice(0, 10);
    return format(addDays(new Date(`${base}T12:00:00`), 10), "yyyy-MM-dd");
  }
  // Férias e demais pagamentos avulsos usam a própria data do documento.
  return args.referencia;
}

/** Data limite para anexar o comprovante: pagamento previsto + tolerância. */
export function prazoComprovante(args: ComprovantePrazoArgs & { toleranciaDias: number }): string {
  const pagamento = pagamentoPrevisto(args);
  return format(addDays(new Date(`${pagamento}T12:00:00`), args.toleranciaDias), "yyyy-MM-dd");
}
