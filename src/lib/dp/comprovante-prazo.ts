import { addDays, format } from "date-fns";
import { competenciaDe, limiteMesSeguinte, limiteNoMes } from "./pendencias-documentos";

/**
 * Prazo do comprovante de pagamento.
 *
 * O comprovante só pode existir depois do pagamento, então a cobrança parte da
 * data prevista de pagamento do documento — nunca da competência crua.
 */

/** Documentos de folha mensal: o pagamento cai no mês seguinte à competência. */
const TIPOS_FOLHA_MES_SEGUINTE = new Set<string>([
  "contracheque",
  "contracheque_13",
  "pro_labore",
  "plr",
  "outros_pagamentos",
]);

export type ComprovantePrazoArgs = {
  tipo: string;
  /** Data de referência do documento (YYYY-MM-DD). */
  referencia: string;
  /** Dia do adiantamento cadastrado na unidade do colaborador. */
  diaAdiantamento?: number | null;
  /** Dia de pagamento da folha configurado nas pendências. */
  diaPagamentoFolha: number;
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
  // Férias, rescisão e demais pagamentos avulsos usam a própria data do documento.
  return args.referencia;
}

/** Data limite para anexar o comprovante: pagamento previsto + tolerância. */
export function prazoComprovante(args: ComprovantePrazoArgs & { toleranciaDias: number }): string {
  const pagamento = pagamentoPrevisto(args);
  return format(addDays(new Date(`${pagamento}T12:00:00`), args.toleranciaDias), "yyyy-MM-dd");
}
