// Regras puras da conferência de extrato (saldo x lançamentos).

/** Diferença abaixo disso (rendimento de centavos, arredondamento) não é lacuna. */
export const GAP_TOLERANCE = 1.0;
/** Detecções são necessárias, mas nunca suficientes sem persistência temporal. */
export const GAP_RECONNECT_AFTER = 3;
export const GAP_PERSIST_HOURS = 48;

export function gapPersistHours(value?: string | number | null): number {
  const hours = Number(value);
  return Number.isFinite(hours) && hours > 0 ? Math.max(24, hours) : GAP_PERSIST_HOURS;
}

export function nextGapFirstSeenAt(previous: string | null | undefined, hasGap: boolean, now: Date): string | null {
  if (!hasGap) return null;
  return previous && Number.isFinite(Date.parse(previous)) ? previous : now.toISOString();
}

/** Mesmo dia operacional usado pela interface anterior (BRT). */
export function shouldShowGap(from: string | null | undefined, to: string | null | undefined, now: Date): boolean {
  const today = new Date(now.getTime() - 3 * 3600_000).toISOString().slice(0, 10);
  return !(from === today && to === today);
}

/** Filtro comum às duas somas, preservando raw ausente e outros motivos. */
export const STATEMENT_NOT_SUPERSEDED_FILTER = 'raw->>_aveto_motivo.is.null,raw->>_aveto_motivo.not.ilike.superseded_by:*';

export function countsInStatement(raw: { _aveto_motivo?: unknown } | null | undefined): boolean {
  return !String(raw?._aveto_motivo ?? '').toLowerCase().startsWith('superseded_by:');
}

/** Lançamento ainda não compensado pelo banco: não entra no staging nem na soma. */
export function isPendingTx(t: { status?: string | null } | null | undefined): boolean {
  return String(t?.status ?? '').toUpperCase() === 'PENDING';
}

/** Arredonda e aplica a tolerância; null = sem lacuna. */
export function gapAfterTolerance(diferenca: number): number | null {
  const d = Math.round(diferenca * 100) / 100;
  return Math.abs(d) < GAP_TOLERANCE ? null : d;
}

/** Contador de detecções consecutivas: sobe com lacuna, zera quando some. */
export function nextGapChecks(prev: number | null | undefined, hasGap: boolean): number {
  return hasGap ? Math.max(0, Number(prev ?? 0)) + 1 : 0;
}

export function shouldSuggestReconnect(checks: number | null | undefined, firstSeenAt: string | null | undefined, now: Date, persistHours = GAP_PERSIST_HOURS): boolean {
  if (!firstSeenAt || Number(checks ?? 0) < GAP_RECONNECT_AFTER) return false;
  const firstSeen = Date.parse(firstSeenAt);
  return Number.isFinite(firstSeen) && now.getTime() - firstSeen >= gapPersistHours(persistHours) * 3600_000;
}

export function gapMessage(nome: string, diferenca: number, de: string, ate: string, checks: number, firstSeenAt: string | null, now: Date, persistHours = GAP_PERSIST_HOURS): string {
  const valor = Math.abs(diferenca).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const br = (s: string) => s.split('-').reverse().join('/');
  const base = `O banco atualizou o saldo de ${nome} mas ainda não entregou todos os lançamentos: faltam R$ ${valor} entre ${br(de)} e ${br(ate)}.`;
  return shouldSuggestReconnect(checks, firstSeenAt, now, persistHours)
    ? `${base} A diferença persiste há pelo menos ${gapPersistHours(persistHours)} horas; importe o extrato ou, em último caso, reconecte o banco.`
    : `${base} Use "Sincronizar novamente"; o sistema também segue buscando automaticamente.`;
}
