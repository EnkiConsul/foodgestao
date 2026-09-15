// Regras do pedido de férias feito pelo próprio colaborador no portal.
// Funções puras — o servidor continua validando tudo de novo.

import { addDays, format, parseISO } from "date-fns";

export type PeriodoPedido = {
  fim_aquisitivo: string;
  limite_concessivo: string;
  dias_direito: number;
  dias_saldo: number;
  gozos: { adiantar_13: boolean; status: string; dias?: number }[];
};

const iso = (d: Date) => format(d, "yyyy-MM-dd");

/**
 * Primeiro dia em que as férias podem começar: o gozo só é possível depois de
 * fechado o período aquisitivo, e nunca em data passada.
 */
export function inicioMinimoPedido(periodo: PeriodoPedido, hojeIso: string): string {
  const depoisDoAquisitivo = iso(addDays(parseISO(periodo.fim_aquisitivo), 1));
  const amanha = iso(addDays(parseISO(hojeIso), 1));
  return depoisDoAquisitivo > amanha ? depoisDoAquisitivo : amanha;
}

/** Máximo de dias que a lei permite vender: um terço do direito (CLT art. 143). */
export function abonoMaximoLegal(diasDireito: number): number {
  if (!Number.isFinite(diasDireito) || diasDireito <= 0) return 0;
  return Math.floor(diasDireito / 3);
}

/** Dias de descanso disponíveis depois de reservar os dias vendidos. */
export function diasDescansoDisponiveis(periodo: PeriodoPedido, abono: number): number {
  return Math.max(0, periodo.dias_saldo - Math.max(0, abono));
}

/** Último dia das férias, calculado a partir do início e da quantidade de dias. */
export function fimDoGozo(inicioIso: string, dias: number): string {
  if (!inicioIso || !Number.isFinite(dias) || dias <= 0) return "";
  return iso(addDays(parseISO(inicioIso), dias - 1));
}

/** O colaborador já adiantou a 1ª parcela do 13º em outro gozo deste período? */
export function decimoTerceiroJaAdiantado(periodo: PeriodoPedido): boolean {
  return (periodo.gozos ?? []).some(
    (g) => g.adiantar_13 && ["planejado", "aprovado", "em_gozo", "concluido"].includes(g.status),
  );
}

/** Texto curto do que o colaborador pode pedir, para mostrar acima dos campos. */
export function resumoPedido(periodo: PeriodoPedido, abono: number, dias: number) {
  const maxAbono = abonoMaximoLegal(periodo.dias_direito);
  const maxDias = diasDescansoDisponiveis(periodo, abono);
  return {
    maxAbono,
    maxDias,
    total: Math.max(0, dias) + Math.max(0, abono),
    excede: Math.max(0, dias) + Math.max(0, abono) > periodo.dias_saldo,
    abonoAcimaDoLegal: abono > maxAbono,
  };
}
