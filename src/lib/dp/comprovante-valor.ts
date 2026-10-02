/**
 * Conferência do valor pago (conta + dinheiro) contra o valor líquido do
 * documento (recibo, contracheque, adiantamento, férias, rescisão).
 *
 * O resultado é orientação: pagamento parcial ou divergente pode ser gravado,
 * mas pede ciência com justificativa na tela.
 */
import { centsParaBRL } from "@/lib/dp/comprovante-quitacao";

export type StatusValor = "exato" | "menor" | "maior" | "sem_referencia";

export type ConferenciaValor = {
  status: StatusValor;
  esperadoCents: number | null;
  comprovadoCents: number;
  /** comprovado - esperado (negativo = falta). */
  diferencaCents: number;
};

export function conferirValor(
  esperadoCents: number | null | undefined,
  bancarioCents: number | null | undefined,
  especieCents: number | null | undefined,
): ConferenciaValor {
  const comprovado = Number(bancarioCents ?? 0) + Number(especieCents ?? 0);
  const esperado = esperadoCents && esperadoCents > 0 ? Number(esperadoCents) : null;
  if (!esperado || comprovado <= 0) {
    return { status: "sem_referencia", esperadoCents: esperado, comprovadoCents: comprovado, diferencaCents: 0 };
  }
  const dif = comprovado - esperado;
  return {
    status: dif === 0 ? "exato" : dif < 0 ? "menor" : "maior",
    esperadoCents: esperado,
    comprovadoCents: comprovado,
    diferencaCents: dif,
  };
}

export function fraseConferenciaValor(c: ConferenciaValor): string | null {
  if (c.status === "exato") return `Valor confere: ${centsParaBRL(c.comprovadoCents)}`;
  if (c.status === "menor") return `Faltam ${centsParaBRL(-c.diferencaCents)} para a quitação integral`;
  if (c.status === "maior") return `Valor comprovado excede o documento em ${centsParaBRL(c.diferencaCents)}`;
  return null;
}

export const JUSTIFICATIVA_VALOR_MIN = 10;
