// Regras puras de lançamentos PENDING da Pluggy e de atualização do staging.

export const PENDING_LOOKBACK_DEFAULT = 15;
export const PENDING_LOOKBACK_MAX = 30;
export const PENDING_MAX_DAYS_DEFAULT = 5;
/** Janela de datas para casar PENDING antigo com POSTED de ID novo. */
export const SUPERSEDE_DATE_WINDOW_DAYS = 3;
export const SUPERSEDED_PREFIX = 'superseded_by:';

function intEnv(raw: string | undefined | null, def: number, min: number, max: number): number {
  const n = Number.parseInt(String(raw ?? ''), 10);
  if (!Number.isFinite(n)) return def;
  return Math.min(Math.max(n, min), max);
}

/** PLUGGY_PENDING_LOOKBACK_DAYS: padrão 15, mínimo 1, teto 30. */
export function pendingLookbackDays(raw?: string | null): number {
  return intEnv(raw, PENDING_LOOKBACK_DEFAULT, 1, PENDING_LOOKBACK_MAX);
}

/** PLUGGY_PENDING_MAX_DAYS: padrão 5, mínimo 0, teto 60. */
export function pendingMaxDays(raw?: string | null): number {
  return intEnv(raw, PENDING_MAX_DAYS_DEFAULT, 0, 60);
}

export function isPendingStatus(s: unknown): boolean {
  return String(s ?? '').toUpperCase() === 'PENDING';
}

function dayMs(d: string): number {
  return Date.parse(`${String(d).slice(0, 10)}T12:00:00Z`);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((dayMs(b) - dayMs(a)) / 86_400_000);
}

/** Data de corte: PENDING com data <= corte já tem N dias ou mais. */
export function pendingCutoff(today: string, maxDays: number): string {
  const d = new Date(dayMs(today));
  d.setUTCDate(d.getUTCDate() - maxDays);
  return d.toISOString().slice(0, 10);
}

/**
 * POSTED sempre entra. PENDING só entra com N dias ou mais (revisão do usuário);
 * mais novo aguarda virar POSTED.
 */
export function shouldImportTx(
  t: { status?: string | null; date?: string | null } | null | undefined,
  today: string,
  maxDays: number,
): boolean {
  if (!t) return false;
  if (!isPendingStatus(t.status)) return true;
  if (!t.date) return false;
  return daysBetween(String(t.date), today) >= maxDays;
}

/** Linha de staging pode ser atualizada com dados atuais da Pluggy? */
export function isStagingUpdatable(prev: { status?: string | null; matched_transaction_id?: string | null }): boolean {
  return prev.status === 'pending' && !prev.matched_transaction_id;
}

/** Início da janela incremental: última data do staging recuada pelo lookback. */
export function incrementalStartFrom(lastDate: string, lookbackDays: number): string {
  const d = new Date(dayMs(lastDate));
  d.setUTCDate(d.getUTCDate() - Math.max(3, lookbackDays));
  return d.toISOString().slice(0, 10);
}

export type StagingCandidate = {
  id: string;
  pluggy_transaction_id: string;
  pluggy_account_id: string;
  status: string;
  matched_transaction_id?: string | null;
  amount: number | string | null;
  date: string | null;
  raw_status?: string | null;
};

/**
 * PENDING antigos (mesma conta, mesmo valor, data ±3 dias, sem conciliação)
 * substituídos por um POSTED de ID novo. Nunca inclui o próprio POSTED.
 */
export function findSupersededPending(
  posted: { pluggy_transaction_id: string; pluggy_account_id: string; amount: number | string; date: string; raw_status?: string | null },
  candidates: StagingCandidate[],
): StagingCandidate[] {
  if (isPendingStatus(posted.raw_status)) return [];
  const cents = Math.round(Number(posted.amount) * 100);
  return candidates.filter((c) =>
    c.pluggy_transaction_id !== posted.pluggy_transaction_id &&
    c.pluggy_account_id === posted.pluggy_account_id &&
    isStagingUpdatable(c) &&
    isPendingStatus(c.raw_status) &&
    c.date !== null &&
    Math.round(Number(c.amount) * 100) === cents &&
    Math.abs(daysBetween(c.date, posted.date)) <= SUPERSEDE_DATE_WINDOW_DAYS
  );
}
