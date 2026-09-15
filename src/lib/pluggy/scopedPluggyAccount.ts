/**
 * Resolução do vínculo Open Finance de uma conta/cartão local.
 *
 * Uma mesma conta local acumula um registro em `pluggy_accounts` por conexão já
 * criada (reconexões deixam as antigas com `status = 'deleted'`). Consultar com
 * `maybeSingle()` devolve erro por múltiplas linhas e fazia a tela concluir
 * "sem vínculo" — ampliando o escopo para a fila inteira da empresa.
 *
 * Regras: só conexão ativa da mesma empresa resolve o vínculo; duas ativas são
 * ambiguidade explícita (nunca um `limit(1)` arbitrário) e erro de consulta é
 * erro, nunca "sem vínculo".
 */

export type PluggyConnectionRef = { id?: string | null; status?: string | null };

export type ScopedPluggyAccountRow = {
  pluggy_account_id: string;
  connection_id: string | null;
  name?: string | null;
  number_masked?: string | null;
  /** Vem do embed `pluggy_connections(id, status)` — objeto ou array. */
  pluggy_connections?: PluggyConnectionRef | PluggyConnectionRef[] | null;
};

export type ScopedPluggyAccount = {
  pluggyAccountId: string;
  connectionId: string;
  name: string | null;
  numberMasked: string | null;
};

export type ScopedPluggyResolution =
  /** Vínculo ativo único encontrado. */
  | { status: "resolved"; account: ScopedPluggyAccount }
  /** A consulta falhou — não afirmar nada sobre o vínculo. */
  | { status: "error" }
  /** Nenhum registro Open Finance para esta conta/cartão. */
  | { status: "not_linked" }
  /** Só conexões encerradas: houve vínculo, mas nenhuma ativa hoje. */
  | { status: "inactive_only" }
  /** Mais de uma conexão ativa apontando para a mesma conta/cartão. */
  | { status: "ambiguous"; candidates: ScopedPluggyAccount[] };

const INACTIVE_STATUS = new Set(["deleted", "revoked", "removed"]);

function connectionStatus(row: ScopedPluggyAccountRow): string | null {
  const ref = Array.isArray(row.pluggy_connections)
    ? row.pluggy_connections[0]
    : row.pluggy_connections;
  const status = ref?.status;
  return typeof status === "string" ? status.trim().toLowerCase() : null;
}

function toAccount(row: ScopedPluggyAccountRow): ScopedPluggyAccount {
  return {
    pluggyAccountId: row.pluggy_account_id,
    connectionId: row.connection_id as string,
    name: row.name ?? null,
    numberMasked: row.number_masked ?? null,
  };
}

export function resolveScopedPluggyAccount(input: {
  rows: ScopedPluggyAccountRow[] | null | undefined;
  error?: unknown;
}): ScopedPluggyResolution {
  if (input.error) return { status: "error" };
  const rows = (input.rows ?? []).filter((r) => !!r?.pluggy_account_id && !!r?.connection_id);
  if (rows.length === 0) return { status: "not_linked" };

  const ativos = rows.filter((r) => {
    const status = connectionStatus(r);
    // Status ausente não é tratado como encerrado: só descartamos o que é
    // explicitamente inativo.
    return !status || !INACTIVE_STATUS.has(status);
  });

  if (ativos.length === 0) return { status: "inactive_only" };
  if (ativos.length === 1) return { status: "resolved", account: toAccount(ativos[0]) };
  return { status: "ambiguous", candidates: ativos.map(toAccount) };
}

/** Colunas necessárias para a resolução (embed do status da conexão incluso). */
export const SCOPED_PLUGGY_ACCOUNT_SELECT =
  "pluggy_account_id, connection_id, name, number_masked, pluggy_connections(id, status)";
