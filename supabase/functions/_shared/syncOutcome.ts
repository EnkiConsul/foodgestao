/**
 * Interpretação do resultado real de `pluggy-sync-item`.
 *
 * HTTP 200 não significa coleta concluída: o corpo pode trazer resultado
 * parcial, item ainda em atualização, conexão ignorada ou espera de
 * confirmação no app do banco. O cron e o worker precisam registrar esse
 * estado real em `last_sync_status`, nunca sucesso cego pelo status HTTP.
 */

export type SyncBody = {
  ok?: boolean;
  partial?: boolean;
  pending?: boolean;
  skipped?: string | null;
  error?: string | null;
  message?: string | null;
  write_failures?: number | null;
  v2_materialized?: boolean | null;
  item_status?: string | null;
  execution_status?: string | null;
};

export type SyncStatus =
  | 'success'
  | 'partial_success'
  | 'pending'
  | 'skipped'
  | 'error';

export interface SyncOutcome {
  status: SyncStatus;
  detail: string | null;
  /** Só zera as tentativas quando a coleta realmente terminou. */
  resetAttempts: boolean;
  /** Se deve tentar de novo em breve (backoff). */
  retry: boolean;
}

const EM_ANDAMENTO = new Set([
  'CREATED',
  'CREATING',
  'UPDATING',
  'LOGIN_IN_PROGRESS',
  'ACCOUNTS_IN_PROGRESS',
  'TRANSACTIONS_IN_PROGRESS',
  'CREDITCARDS_IN_PROGRESS',
  'IDENTITY_IN_PROGRESS',
  'INVESTMENTS_IN_PROGRESS',
  'OPPORTUNITIES_IN_PROGRESS',
  'PAYMENT_DATA_IN_PROGRESS',
  'WAITING_USER_INPUT',
  'WAITING_USER_ACTION',
  'USER_AUTHORIZATION_PENDING',
]);

const upper = (v?: string | null) => String(v ?? '').toUpperCase();

export function classifySyncResult(input: {
  httpStatus: number;
  body: SyncBody | null;
  transportError?: string | null;
}): SyncOutcome {
  if (input.transportError) {
    return {
      status: 'error',
      detail: input.transportError.slice(0, 500),
      resetAttempts: false,
      retry: true,
    };
  }

  const body = input.body;

  if (input.httpStatus < 200 || input.httpStatus >= 300) {
    return {
      status: 'error',
      detail: `HTTP ${input.httpStatus}: ${(body?.message ?? body?.error ?? '').toString().slice(0, 400)}`,
      resetAttempts: false,
      retry: true,
    };
  }

  if (!body) {
    return {
      status: 'error',
      detail: 'Resposta sem corpo interpretável.',
      resetAttempts: false,
      retry: true,
    };
  }

  if (body.error) {
    return {
      status: 'error',
      detail: String(body.message ?? body.error).slice(0, 500),
      resetAttempts: false,
      retry: true,
    };
  }

  if (body.skipped) {
    return {
      status: 'skipped',
      detail: String(body.skipped),
      resetAttempts: true,
      retry: false,
    };
  }

  if (body.pending) {
    return {
      status: 'pending',
      detail: body.message ? String(body.message).slice(0, 500) : 'Conexão ainda não liberada pelo banco.',
      resetAttempts: false,
      retry: true,
    };
  }

  const item = upper(body.item_status);
  const exec = upper(body.execution_status);

  if (EM_ANDAMENTO.has(exec) || EM_ANDAMENTO.has(item)) {
    return {
      status: 'pending',
      detail: 'Coleta ainda em andamento no banco.',
      resetAttempts: false,
      retry: true,
    };
  }

  const parcial =
    body.partial === true ||
    exec === 'PARTIAL_SUCCESS' ||
    (body.write_failures ?? 0) > 0 ||
    body.v2_materialized === false;

  if (parcial) {
    return {
      status: 'partial_success',
      detail: (body.message ?? 'Parte dos dados não foi atualizada.').toString().slice(0, 500),
      resetAttempts: false,
      retry: true,
    };
  }

  if (exec === 'ERROR' || item === 'ERROR' || item === 'OUTDATED') {
    return {
      status: 'error',
      detail: 'O banco terminou a coleta com erro.',
      resetAttempts: false,
      retry: true,
    };
  }

  if (body.ok === true) {
    return { status: 'success', detail: null, resetAttempts: true, retry: false };
  }

  return {
    status: 'error',
    detail: 'Sincronização encerrada sem confirmação do banco.',
    resetAttempts: false,
    retry: true,
  };
}
