/**
 * Traduz erros de autorização do Open Finance (widget Pluggy Connect ou
 * parâmetros de retorno do banco) para mensagens claras em português.
 *
 * Erros desconhecidos preservam o texto original — nunca inventamos causa.
 */

export type ConnectErrorInput = {
  code?: string | null;
  message?: string | null;
};

export type ConnectErrorDescription = {
  /** Título curto para a tela de falha. */
  title: string;
  /** Explicação do que aconteceu. */
  message: string;
  /** Orientação prática do que fazer agora. */
  hint: string;
  /** Código técnico, quando disponível (para suporte). */
  code: string | null;
};

const AUTHORIZATION_FAILED: Omit<ConnectErrorDescription, "code"> = {
  title: "O banco não concluiu a autorização",
  message:
    "A solicitação de consentimento enviada ao seu banco expirou ou foi recusada por ele, então nenhuma conta foi conectada.",
  hint:
    "Inicie a conexão novamente e conclua a autorização sem recarregar a página, voltar ou reabrir o link do banco. Se repetir várias vezes, é indisponibilidade momentânea do banco — tente mais tarde.",
};

const INVALID_CREDENTIALS: Omit<ConnectErrorDescription, "code"> = {
  title: "Credenciais recusadas pelo banco",
  message: "O banco não aceitou os dados de acesso informados.",
  hint: "Confira usuário, senha e código de acesso no app do banco e inicie a conexão novamente.",
};

const BANK_UNAVAILABLE: Omit<ConnectErrorDescription, "code"> = {
  title: "Banco temporariamente indisponível",
  message: "O ambiente de Open Finance do banco não respondeu.",
  hint: "Aguarde alguns minutos e inicie a conexão novamente. Não é um problema no Aveto 360.",
};

const TIMEOUT: Omit<ConnectErrorDescription, "code"> = {
  title: "Tempo esgotado na tela do banco",
  message: "A autorização não foi concluída dentro do prazo permitido pelo banco.",
  hint: "Inicie a conexão novamente e conclua a autorização sem pausas longas.",
};

const USER_CANCELLED: Omit<ConnectErrorDescription, "code"> = {
  title: "Autorização não concluída",
  message: "A autorização foi interrompida antes de o banco confirmar o acesso.",
  hint: "Inicie a conexão novamente e siga até o fim no site ou app do banco.",
};

const CODE_MAP: Record<string, Omit<ConnectErrorDescription, "code">> = {
  server_error: AUTHORIZATION_FAILED,
  access_denied: AUTHORIZATION_FAILED,
  invalid_request: AUTHORIZATION_FAILED,
  invalid_request_object: AUTHORIZATION_FAILED,
  consent_rejected: AUTHORIZATION_FAILED,
  user_authorization_not_granted: AUTHORIZATION_FAILED,
  user_authorization_pending: AUTHORIZATION_FAILED,
  invalid_credentials: INVALID_CREDENTIALS,
  login_error: INVALID_CREDENTIALS,
  account_locked: INVALID_CREDENTIALS,
  invalid_credentials_mfa: INVALID_CREDENTIALS,
  site_not_available: BANK_UNAVAILABLE,
  connection_error: BANK_UNAVAILABLE,
  temporarily_unavailable: BANK_UNAVAILABLE,
  unexpected_error: BANK_UNAVAILABLE,
  user_input_timeout: TIMEOUT,
  timeout: TIMEOUT,
  user_not_supported: USER_CANCELLED,
};

/** Trechos de mensagem que identificam a falha quando não há código útil. */
const MESSAGE_PATTERNS: Array<[RegExp, Omit<ConnectErrorDescription, "code">]> = [
  [/pushed authorization request/i, AUTHORIZATION_FAILED],
  [/authorization (request )?(not )?(found|retrieve|expired)/i, AUTHORIZATION_FAILED],
  [/consent(imento)?/i, AUTHORIZATION_FAILED],
  [/contact your administrator/i, AUTHORIZATION_FAILED],
  [/credenc|credential|senha|password/i, INVALID_CREDENTIALS],
  [/unavailable|indispon|manuten|maintenance/i, BANK_UNAVAILABLE],
  [/timeout|tempo esgotado|expirou/i, TIMEOUT],
];

function normalizeCode(code?: string | null): string | null {
  if (!code) return null;
  const trimmed = String(code).trim();
  return trimmed ? trimmed : null;
}

export function describeConnectError(input: ConnectErrorInput): ConnectErrorDescription {
  const code = normalizeCode(input.code);
  const message = input.message ? String(input.message).trim() : "";
  const key = code ? code.toLowerCase().replace(/[\s-]+/g, "_") : null;

  const byCode = key ? CODE_MAP[key] : undefined;
  if (byCode) return { ...byCode, code };

  if (message) {
    for (const [pattern, description] of MESSAGE_PATTERNS) {
      if (pattern.test(message)) return { ...description, code };
    }
  }

  return {
    title: "Não foi possível concluir a conexão",
    message: message || "O banco não confirmou a autorização.",
    hint: "Inicie a conexão novamente. Se o erro continuar, informe o suporte com o texto acima.",
    code,
  };
}
