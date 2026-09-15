/**
 * Interpreta a resposta de `pluggy-sync-item`.
 *
 * A função devolve HTTP 200 (e muitas vezes `ok: true`) em situações que NÃO são
 * coleta concluída: item ainda em execução (`UPDATING`), banco aguardando
 * confirmação do usuário (`WAITING_USER_INPUT`), execução com erro, resultado
 * parcial, conexão ignorada ou pendente. Só afirmamos sucesso quando o item
 * volta como `UPDATED` com execução `SUCCESS`.
 */

export type SyncResponse = {
  ok?: boolean;
  pending?: boolean;
  skipped?: string | null;
  error?: string | null;
  message?: string | null;
  transactions?: number | null;
  accounts?: number | null;
  item_status?: string | null;
  execution_status?: string | null;
};

export type SyncFeedbackLevel = "success" | "warning" | "info" | "error";

export type SyncFeedback = {
  level: SyncFeedbackLevel;
  title: string;
  description?: string;
  /** Só sugerimos reconectar quando o status indica necessidade de nova autorização. */
  suggestReconnect: boolean;
};

const RECONNECT_ITEM_STATUS = new Set(["LOGIN_ERROR", "OUTDATED", "INVALID_CREDENTIALS"]);
const RECONNECT_EXECUTION_STATUS = new Set([
  "LOGIN_ERROR",
  "INVALID_CREDENTIALS",
  "INVALID_CREDENTIALS_MFA",
  "ALREADY_LOGGED_IN",
  "ACCOUNT_LOCKED",
  "ACCOUNT_NEEDS_ACTION",
  "USER_AUTHORIZATION_PENDING",
  "USER_AUTHORIZATION_NOT_GRANTED",
  "CONSENT_REVOKED",
]);
const WAITING_EXECUTION_STATUS = new Set([
  "WAITING_USER_INPUT",
  "WAITING_USER_ACTION",
  "USER_AUTHORIZATION_PENDING",
]);
const RUNNING_EXECUTION_STATUS = new Set([
  "CREATED",
  "CREATING",
  "UPDATING",
  "LOGIN_IN_PROGRESS",
  "ACCOUNTS_IN_PROGRESS",
  "TRANSACTIONS_IN_PROGRESS",
  "CREDITCARDS_IN_PROGRESS",
  "IDENTITY_IN_PROGRESS",
  "INVESTMENTS_IN_PROGRESS",
  "OPPORTUNITIES_IN_PROGRESS",
  "PAYMENT_DATA_IN_PROGRESS",
]);

const RECONNECT_HINT =
  "O banco pediu uma nova autorização: use “Reconectar” para renovar o acesso.";
const RETRY_HINT = "Tente sincronizar novamente em alguns minutos.";

function upper(v?: string | null): string {
  return String(v ?? "").toUpperCase();
}

export function describeSyncOutcome(input: {
  transportError?: boolean;
  body: SyncResponse | null;
}): SyncFeedback {
  const body = input.body;
  const itemStatus = upper(body?.item_status);
  const execStatus = upper(body?.execution_status);
  const needsReauth =
    RECONNECT_ITEM_STATUS.has(itemStatus) || RECONNECT_EXECUTION_STATUS.has(execStatus);
  const lancamentos = body?.transactions ?? 0;

  if (input.transportError || body?.error) {
    return {
      level: "error",
      title: "Não foi possível concluir a sincronização",
      description: needsReauth ? RECONNECT_HINT : RETRY_HINT,
      suggestReconnect: needsReauth,
    };
  }

  if (body?.pending) {
    return {
      level: "info",
      title: "O banco ainda não liberou esta conexão",
      description: "Nada foi atualizado agora. " + RETRY_HINT,
      suggestReconnect: false,
    };
  }

  if (body?.skipped) {
    const revogada = body.skipped === "connection_revoked";
    return {
      level: "info",
      title: "Esta conexão não foi sincronizada",
      description: revogada
        ? "O acesso ao banco foi encerrado. Reconecte para voltar a atualizar."
        : "A conexão não está mais ativa nesta empresa.",
      suggestReconnect: revogada,
    };
  }

  if (needsReauth) {
    return {
      level: WAITING_EXECUTION_STATUS.has(execStatus) ? "info" : "error",
      title: WAITING_EXECUTION_STATUS.has(execStatus)
        ? "O banco está aguardando sua autorização"
        : "O banco recusou o acesso nesta coleta",
      description: RECONNECT_HINT,
      suggestReconnect: true,
    };
  }

  if (WAITING_EXECUTION_STATUS.has(execStatus)) {
    return {
      level: "info",
      title: "O banco está aguardando sua confirmação",
      description: "Conclua a confirmação no app do banco e sincronize de novo.",
      suggestReconnect: false,
    };
  }

  if (execStatus === "PARTIAL_SUCCESS") {
    return {
      level: "warning",
      title: "Parte dos dados não foi atualizada",
      description: `O banco não concluiu a coleta desta vez (${lancamentos} lançamentos recebidos). ${RETRY_HINT}`,
      suggestReconnect: false,
    };
  }

  if (RUNNING_EXECUTION_STATUS.has(execStatus) || itemStatus === "UPDATING") {
    return {
      level: "info",
      title: "O banco ainda está atualizando os dados",
      description: "A coleta continua em andamento. " + RETRY_HINT,
      suggestReconnect: false,
    };
  }

  if (body?.ok && itemStatus === "UPDATED" && execStatus === "SUCCESS") {
    return {
      level: "success",
      title: `Sincronização concluída (${lancamentos} lançamentos)`,
      suggestReconnect: false,
    };
  }

  if (execStatus === "ERROR" || itemStatus === "ERROR") {
    return {
      level: "error",
      title: "O banco terminou a coleta com erro",
      description: RETRY_HINT,
      suggestReconnect: false,
    };
  }

  return {
    level: "info",
    title: "Sincronização encerrada sem confirmação do banco",
    description: "Confira o status da conexão e tente novamente se necessário.",
    suggestReconnect: false,
  };
}
