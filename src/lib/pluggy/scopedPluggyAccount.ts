/**
 * Resolução do vínculo Open Finance de uma conta/cartão local.
 *
 * Uma mesma conta local acumula um registro em `pluggy_accounts` por conexão já
 * criada (reconexões deixam as antigas com `status = 'deleted'`). Consultar com
 * `maybeSingle()` devolve erro por múltiplas linhas e fazia a tela concluir
 * "sem vínculo" — ampliando o escopo para a fila inteira da empresa.
 *
 * Regras (fail closed):
 * - só conexão ativa da MESMA empresa resolve o vínculo;
 * - duas ativas são ambiguidade explícita (nunca um `limit(1)` arbitrário);
 * - erro de consulta é erro, nunca "sem vínculo";
 * - status/embed da conexão ausente NÃO é presumido ativo nem visível: falha
 *   como `unverified`;
 * - `company_id` do registro e da conexão precisam bater com a empresa pedida;
 *   divergência é `foreign_company`, nunca vínculo válido.
 */

export type PluggyConnectionRef = {
  id?: string | null;
  status?: string | null;
  company_id?: string | null;
};

export type ScopedPluggyAccountRow = {
  pluggy_account_id: string;
  connection_id: string | null;
  company_id?: string | null;
  name?: string | null;
  number_masked?: string | null;
  /** Vem do embed `pluggy_connections(id, status, company_id)` — objeto ou array. */
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
  /** Registro/conexão de outra empresa: nunca serve para o escopo pedido. */
  | { status: "foreign_company" }
  /** Conexão sem status legível (embed ausente/sem permissão): não presumir ativa. */
  | { status: "unverified" }
  /** Mais de uma conexão ativa apontando para a mesma conta/cartão. */
  | { status: "ambiguous"; candidates: ScopedPluggyAccount[] };

const INACTIVE_STATUS = new Set(["deleted", "revoked", "removed"]);

function connectionRef(row: ScopedPluggyAccountRow): PluggyConnectionRef | null {
  const ref = Array.isArray(row.pluggy_connections)
    ? row.pluggy_connections[0]
    : row.pluggy_connections;
  return ref ?? null;
}

function connectionStatus(ref: PluggyConnectionRef | null): string | null {
  const status = ref?.status;
  return typeof status === "string" && status.trim() ? status.trim().toLowerCase() : null;
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
  /** Empresa em escopo; quando informada, a titularidade é validada aqui também. */
  companyId?: string | null;
}): ScopedPluggyResolution {
  if (input.error) return { status: "error" };

  const rows = (input.rows ?? []).filter((r) => !!r?.pluggy_account_id && !!r?.connection_id);
  if (rows.length === 0) return { status: "not_linked" };

  const companyId = input.companyId ?? null;
  let foreign = false;
  const mesmaEmpresa = rows.filter((row) => {
    if (!companyId) return true;
    const ref = connectionRef(row);
    // Ausência de company_id (no registro ou na conexão) não é tratada como
    // "mesma empresa": sem confirmação, o vínculo não vale.
    const ok = row.company_id === companyId && ref?.company_id === companyId;
    if (!ok) foreign = true;
    return ok;
  });
  if (mesmaEmpresa.length === 0) return { status: foreign ? "foreign_company" : "not_linked" };

  let unverified = false;
  const ativos = mesmaEmpresa.filter((row) => {
    const status = connectionStatus(connectionRef(row));
    if (!status) {
      // Embed/status ausente: não presumir conexão ativa nem visível.
      unverified = true;
      return false;
    }
    return !INACTIVE_STATUS.has(status);
  });

  if (ativos.length === 0) return { status: unverified ? "unverified" : "inactive_only" };
  if (ativos.length === 1) return { status: "resolved", account: toAccount(ativos[0]) };
  return { status: "ambiguous", candidates: ativos.map(toAccount) };
}

/** Colunas necessárias para a resolução (empresa e status da conexão inclusos). */
export const SCOPED_PLUGGY_ACCOUNT_SELECT =
  "pluggy_account_id, connection_id, company_id, name, number_masked, pluggy_connections(id, status, company_id)";
