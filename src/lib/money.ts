/**
 * Utilitários monetários em centavos inteiros.
 *
 * Motivo: somar valores em ponto flutuante (IEEE-754) acumula desvios
 * (0.1 + 0.2 = 0.30000000000000004). Todo somatório monetário do frontend
 * deve acumular em centavos inteiros e converter de volta apenas no final.
 */

/** Converte um valor em reais para centavos inteiros. */
export function toCents(value: number | null | undefined): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

/** Converte centavos inteiros de volta para reais. */
export function fromCents(cents: number): number {
  if (!Number.isFinite(cents)) return 0;
  return Math.round(cents) / 100;
}

/** Soma uma lista de valores monetários acumulando em centavos. */
export function sumMoney(values: Array<number | null | undefined>): number {
  let cents = 0;
  for (const v of values) cents += toCents(v);
  return fromCents(cents);
}

/** Subtração monetária exata (a - b). */
export function subtractMoney(a: number | null | undefined, b: number | null | undefined): number {
  return fromCents(toCents(a) - toCents(b));
}

/** Adição monetária exata (a + b). */
export function addMoney(a: number | null | undefined, b: number | null | undefined): number {
  return fromCents(toCents(a) + toCents(b));
}
