/**
 * Prazo de aprovação de documento pelo colaborador.
 *
 * Documento enviado pela empresa que exige aprovação tem 5 dias corridos
 * desde o envio. Passado o prazo, a pendência vira "Atraso grave".
 */
export const PRAZO_APROVACAO_DIAS = 5;

const DIA_MS = 24 * 60 * 60 * 1000;

function inicioDoDia(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Data limite (fim do prazo) a partir do envio do documento. */
export function vencimentoAprovacao(createdAt: string | Date): Date {
  const base = createdAt instanceof Date ? new Date(createdAt) : new Date(createdAt);
  base.setDate(base.getDate() + PRAZO_APROVACAO_DIAS);
  return base;
}

/**
 * Dias de atraso: positivo quando o prazo já passou, zero ou negativo
 * enquanto ainda está dentro do prazo.
 */
export function atrasoAprovacao(createdAt: string | Date, hoje: Date = new Date()): number {
  const limite = vencimentoAprovacao(createdAt);
  return Math.round((inicioDoDia(hoje) - inicioDoDia(limite)) / DIA_MS);
}

/** Atraso grave: passou dos 5 dias corridos sem aprovação. */
export function atrasoGraveAprovacao(createdAt: string | Date, hoje: Date = new Date()): boolean {
  return atrasoAprovacao(createdAt, hoje) > 0;
}
