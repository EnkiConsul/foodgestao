/**
 * Regras puras do cadastro de contas financeiras em várias empresas.
 *
 * Modelo preservado: cada empresa tem seu PRÓPRIO registro em `accounts`
 * (id, saldo inicial, saldo atual e lançamentos independentes). Não existe
 * compartilhamento de conta/saldo entre empresas e nada aqui sincroniza
 * registros depois de criados.
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
 * Id da conta da empresa atualmente selecionada — é ele que segue para o
 * fluxo de importar extrato, para nunca apontar a conta de outra empresa.
 */
export function resolvePrimaryCreatedId(
  created: Array<{ id: string; company_id: string | null }>,
  currentCompanyId: string | null,
): string | undefined {
  if (created.length === 0) return undefined;
  const match = created.find((c) => (c.company_id ?? null) === (currentCompanyId ?? null));
  return (match ?? created[0]).id;
}

/** Mensagem de sucesso informando quantas contas foram criadas. */
export function describeSaveResult(createdCount: number, updated: boolean): string {
  if (updated && createdCount === 0) return "Conta atualizada";
  if (updated && createdCount === 1) return "Conta atualizada e 1 cópia criada em outra empresa";
  if (updated) return `Conta atualizada e ${createdCount} cópias criadas em outras empresas`;
  if (createdCount === 1) return "Conta criada";
  return `${createdCount} contas criadas, uma independente por empresa`;
}
