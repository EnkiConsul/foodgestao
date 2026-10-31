// Regras puras do cron Pluggy e da autoria da conexão (sem Deno/IO, testáveis no vitest).

export const CRON_WALL_CLOCK_MS = 120_000;

export interface CronLimits {
  batchSize: number;
  parallelism: number;
  itemTimeoutMs: number;
  syncWaitMs: number;
  reduced: boolean;
}

function num(v: string | undefined | null, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

/**
 * Lê os limites (padrões 12, 6, 50000, 20000) e garante
 * ceil(BATCH/PARALLELISM) × ITEM_TIMEOUT ≤ 120000; se passar, reduz o lote.
 */
export function resolveCronLimits(env: (k: string) => string | undefined | null): CronLimits {
  let batchSize = num(env('PLUGGY_CRON_BATCH_SIZE'), 12);
  const parallelism = num(env('PLUGGY_CRON_PARALLELISM'), 6);
  const itemTimeoutMs = num(env('PLUGGY_CRON_ITEM_TIMEOUT_MS'), 50_000);
  const syncWaitMs = num(env('PLUGGY_CRON_SYNC_WAIT_MS'), 20_000);
  const maxWaves = Math.max(1, Math.floor(CRON_WALL_CLOCK_MS / itemTimeoutMs));
  let reduced = false;
  if (Math.ceil(batchSize / parallelism) * itemTimeoutMs > CRON_WALL_CLOCK_MS) {
    batchSize = Math.max(1, maxWaves * parallelism);
    reduced = true;
  }
  return { batchSize, parallelism, itemTimeoutMs, syncWaitMs, reduced };
}

/** created_by só na criação: usuário que conectou ou, sem usuário, o dono da empresa. */
export function createdByOnInsert(
  existing: boolean, userId: string | null, companyOwnerId: string | null,
): string | null {
  if (existing) return null;
  return userId ?? companyOwnerId ?? null;
}
