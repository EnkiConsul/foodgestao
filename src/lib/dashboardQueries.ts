// Consultas compartilhadas do Dashboard.
//
// Ficam aqui (e não dentro da página) para que o seletor de empresa possa
// pré-carregar exatamente as mesmas chaves/funções usadas pelo Dashboard,
// evitando a espera fria depois da troca de contexto.
import { supabase } from "@/integrations/supabase/client";
import {
  applyFinancialScope,
  assertFinancialScope,
  type ContextType,
} from "@/lib/financialScope";

export type PaymentStatusFilter = "todos" | "confirmado" | "pendente";

export interface DashboardScopeArgs {
  userId: string;
  contextType: ContextType;
  companyId: string | null;
}

export interface DashboardTransactionsArgs extends DashboardScopeArgs {
  /** Identificador estável do período (preset ou "custom"). */
  periodKey: string;
  /** Datas do intervalo em ISO (YYYY-MM-DD...). */
  fromISO: string;
  toISO: string;
  paymentStatus: PaymentStatusFilter;
}

export interface DashboardTransaction {
  amount: number;
  amount_paid: number | null;
  transaction_type: string;
  transaction_date: string;
  category_id: string | null;
  status: string;
  due_date: string | null;
}

export interface DashboardCategory {
  id: string;
  name: string;
  color: string | null;
}

export interface DashboardAccount {
  name: string;
  current_balance: number;
  color: string | null;
  is_active: boolean;
  bank_slug?: string | null;
  account_type?: string | null;
}


export const dashboardTransactionsKey = (a: DashboardTransactionsArgs) =>
  [
    "dashboard-transactions",
    a.userId,
    a.contextType,
    a.companyId,
    a.periodKey,
    a.fromISO,
    a.toISO,
    a.paymentStatus,
  ] as const;

export const dashboardCategoriesKey = (a: DashboardScopeArgs) =>
  ["dashboard-categories", a.userId, a.contextType, a.companyId] as const;

export const dashboardAccountsKey = (a: DashboardScopeArgs) =>
  ["dashboard-accounts", a.userId, a.contextType, a.companyId] as const;

export async function fetchDashboardTransactions(
  a: DashboardTransactionsArgs,
): Promise<DashboardTransaction[]> {
  const scope = assertFinancialScope({
    context: a.contextType,
    userId: a.userId,
    companyId: a.companyId,
  });
  const startDate = a.fromISO.slice(0, 10);
  const endDate = a.toISO.slice(0, 10);

  let q = applyFinancialScope(
    supabase
      .from("transactions")
      .select(
        "amount, amount_paid, transaction_type, transaction_date, category_id, status, due_date",
      ),
    scope,
  )
    // Mesmo critério de Lançamentos: quando existe vencimento, o período é o do due_date.
    .or(
      `and(due_date.is.null,transaction_date.gte.${startDate},transaction_date.lte.${endDate}),and(due_date.gte.${startDate},due_date.lte.${endDate})`,
    )
    .neq("status", "cancelado");

  if (a.paymentStatus !== "todos") q = q.eq("status", a.paymentStatus);

  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as unknown as DashboardTransaction[];
}

export async function fetchDashboardCategories(
  a: DashboardScopeArgs,
): Promise<DashboardCategory[]> {
  if (a.contextType === "pj" && !a.companyId) return [];
  const { data, error } = await supabase.rpc("get_accessible_categories", {
    _context: a.contextType,
    _company_id: a.contextType === "pj" ? a.companyId! : undefined,
  });
  if (error) throw error;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((c: any) => ({ id: c.id, name: c.name, color: c.color }));
}

export async function fetchDashboardAccounts(
  a: DashboardScopeArgs,
): Promise<DashboardAccount[]> {
  if (a.contextType === "pj" && !a.companyId) return [];
  const { data, error } = await supabase.rpc("get_accessible_accounts", {
    _context: a.contextType,
    _company_id: a.contextType === "pj" ? a.companyId! : undefined,
  });
  if (error) throw error;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((a2: any) => ({
    name: a2.name,
    current_balance: a2.current_balance,
    color: a2.color,
    is_active: a2.is_active,
    bank_slug: a2.bank_slug,
    account_type: a2.account_type,
  })) as DashboardAccount[];
}
