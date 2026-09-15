/**
 * Regras puras do cadastro de contas financeiras em várias empresas.
 *
 * Modelo preservado: cada empresa tem seu PRÓPRIO registro em `accounts`
 * (id, saldo inicial, saldo atual e lançamentos independentes). Não existe
 * compartilhamento de conta/saldo entre empresas e nada aqui sincroniza
 * registros depois de criados.
 *
 * Cada envio do formulário executa UMA única mutação:
 * - editar conta  -> apenas UPDATE dos dados cadastrais da própria conta;
 * - criar cópias  -> apenas INSERT em lote das novas contas.
 * Nunca há update + insert no mesmo envio, nem delete compensatório.
 */
import type { Database } from "@/integrations/supabase/types";

export type AccountType = Database["public"]["Enums"]["account_type"];

export interface AccountCadastralData {
  name: string;
  accountType: AccountType;
  bankSlug: string | null;
  agency: string | null;
  accountNumber: string | null;
  isAccounting: boolean;
}

export interface AccountCopyTarget {
  /** null = conta pessoal (PF) */
  companyId: string | null;
  /** saldo inicial próprio da conta daquela empresa */
  initialBalance: number;
}

export interface AccountInsertRow {
  user_id: string;
  company_id: string | null;
  context: "pf" | "pj";
  name: string;
  account_type: AccountType;
  initial_balance: number;
  current_balance: number;
  bank_slug: string | null;
  agency: string | null;
  account_number: string | null;
  is_accounting: boolean;
}

export class AccountTargetsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AccountTargetsError";
  }
}

/**
 * Valida a seleção de empresas de destino.
 * - pelo menos uma empresa quando há contas a criar;
 * - sem empresa repetida;
 * - nunca a própria empresa da conta em edição (evitaria duplicar a mesma conta).
 */
export function assertCopyTargets(
  targets: AccountCopyTarget[],
  options: { requireAtLeastOne: boolean; currentCompanyId?: string | null },
): void {
  if (options.requireAtLeastOne && targets.length === 0) {
    throw new AccountTargetsError("Selecione ao menos uma empresa");
  }
  const seen = new Set<string>();
  for (const t of targets) {
    const key = t.companyId ?? "__pf__";
    if (seen.has(key)) {
      throw new AccountTargetsError("Empresa repetida na seleção");
    }
    seen.add(key);
    if (
      options.currentCompanyId &&
      t.companyId &&
      t.companyId === options.currentCompanyId
    ) {
      throw new AccountTargetsError("A conta editada já pertence a esta empresa");
    }
    if (!Number.isFinite(t.initialBalance)) {
      throw new AccountTargetsError("Saldo inicial inválido");
    }
  }
}

/**
 * Monta as linhas a inserir — uma por empresa, cada uma com o próprio saldo.
 * Nada de credenciais, consentimentos ou vínculos de Open Finance é copiado:
 * o registro novo nasce puramente manual.
 */
export function buildAccountRows(
  data: AccountCadastralData,
  targets: AccountCopyTarget[],
  userId: string,
): AccountInsertRow[] {
  const name = data.name.trim();
  return targets.map((t) => ({
    user_id: userId,
    company_id: t.companyId,
    context: t.companyId ? "pj" : "pf",
    name,
    account_type: data.accountType,
    initial_balance: t.initialBalance,
    current_balance: t.initialBalance,
    bank_slug: data.bankSlug,
    agency: data.agency,
    account_number: data.accountNumber,
    is_accounting: data.isAccounting,
  }));
}

/**
 * Id da conta pertencente AO CONTEXTO ATIVO — é o único que pode seguir para o
 * fluxo de importar extrato. Sem correspondência exata, devolve `undefined`
 * (nunca a conta de outra empresa).
 */
export function resolvePrimaryCreatedId(
  created: Array<{ id: string; company_id: string | null }>,
  currentCompanyId: string | null,
): string | undefined {
  const match = created.find((c) => (c.company_id ?? null) === (currentCompanyId ?? null));
  return match?.id;
}

/** Mensagem de sucesso informando quantas contas foram criadas. */
export function describeSaveResult(createdCount: number, updated: boolean): string {
  if (updated) return "Conta atualizada";
  if (createdCount === 1) return "Conta criada";
  return `${createdCount} contas criadas, uma independente por empresa`;
}

export type SaveFailureKind = "permission" | "network" | "no_rows" | "unknown";

/**
 * Classifica a falha para uma mensagem honesta: erro de rede tem resultado
 * INDETERMINADO e não pode ser anunciado como "nada foi salvo".
 */
export function classifySaveFailure(err: unknown): SaveFailureKind {
  if (err && typeof err === "object" && "message" in err) {
    const message = String((err as { message?: unknown }).message ?? "");
    if (/row-level security|permission denied|violates row/i.test(message)) return "permission";
    if (/fetch|network|timeout|Failed to send|ECONNRESET/i.test(message)) return "network";
    return "unknown";
  }
  return "unknown";
}

export function describeSaveFailure(kind: SaveFailureKind, action: "update" | "insert"): string {
  if (kind === "network") {
    return "A conexão falhou e não foi possível confirmar o resultado. Recarregue a página e verifique antes de tentar de novo.";
  }
  if (kind === "permission") {
    return action === "insert"
      ? "Você não tem permissão para criar contas em uma das empresas selecionadas. Nada foi criado."
      : "Você não tem permissão para alterar esta conta. Nada foi alterado.";
  }
  if (kind === "no_rows") {
    return action === "insert"
      ? "Nenhuma conta foi criada. Verifique suas permissões nas empresas selecionadas."
      : "Nenhuma alteração foi aplicada. A conta pode ter sido removida ou você não tem permissão para alterá-la.";
  }
  return action === "insert"
    ? "Não foi possível criar as contas."
    : "Não foi possível salvar a conta.";
}
