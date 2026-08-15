// Module-level permission system for company members.
// Keys are stable strings used in the DB column `company_members.permissions` (jsonb).

import {
  ORDERS_PERMISSION_KEYS,
  ORDERS_PERMISSION_LABELS,
  isOrdersPermissionKey,
  type OrdersPermissionKey,
} from "@/lib/orders/permissions";

export type PermissionLevel = "none" | "view" | "edit";

export type FinanceModuleKey =
  | "dashboard"
  | "transactions"
  | "accounts"
  | "categories"
  | "contacts"
  | "payment_methods"
  | "budgets"
  | "reports"
  | "cash_flow"
  | "attachments";

export type ModuleKey = FinanceModuleKey | OrdersPermissionKey;

export const MODULE_LABELS: Record<ModuleKey, string> = {
  dashboard: "Dashboard",
  transactions: "Lançamentos",
  accounts: "Contas Bancárias",
  categories: "Categorias",
  contacts: "Contatos",
  payment_methods: "Formas de Pagamento",
  budgets: "Orçamento",
  reports: "Relatórios",
  cash_flow: "Fluxo de Caixa",
  attachments: "Anexos",
  ...ORDERS_PERMISSION_LABELS,
};

export const FINANCE_MODULES: FinanceModuleKey[] = [
  "dashboard",
  "transactions",
  "accounts",
  "categories",
  "contacts",
  "payment_methods",
  "budgets",
  "reports",
  "cash_flow",
  "attachments",
];

export const ALL_MODULES = [...FINANCE_MODULES, ...ORDERS_PERMISSION_KEYS] as ModuleKey[];

export type CompanyRole = "owner" | "admin" | "member" | "viewer" | "contabilidade";

/** Módulos financeiros visíveis para o papel Contabilidade (somente leitura). */
export const ACCOUNTING_MODULES: FinanceModuleKey[] = [
  "dashboard",
  "transactions",
  "accounts",
  "categories",
  "contacts",
  "payment_methods",
  "reports",
  "cash_flow",
  "attachments",
];

export type PermissionsMap = Partial<Record<ModuleKey, PermissionLevel>>;

export function getDefaultPermissions(role: CompanyRole): PermissionsMap {
  const all = (lvl: PermissionLevel): PermissionsMap =>
    Object.fromEntries(ALL_MODULES.map((m) => [m, lvl])) as PermissionsMap;

  switch (role) {
    case "owner":
    case "admin":
      return all("edit");
    case "viewer":
      return all("view");
    case "member":
      return {
        dashboard: "view",
        transactions: "edit",
        accounts: "edit",
        categories: "edit",
        contacts: "edit",
        payment_methods: "edit",
        attachments: "edit",
        budgets: "view",
        reports: "view",
        cash_flow: "view",
        // Pedidos: chaves canônicas começam fechadas (fail closed).
        ...(Object.fromEntries(
          ORDERS_PERMISSION_KEYS.map((k) => [k, "none"]),
        ) as PermissionsMap),
      };
  }
}

export function resolvePermission(
  role: CompanyRole | undefined,
  permissions: PermissionsMap | null | undefined,
  module: ModuleKey,
): PermissionLevel {
  if (!role) return "none";
  if (role === "owner" || role === "admin") return "edit";
  if (role === "viewer") return "view";
  // Módulo Pedidos: ausência de chave = sem acesso (nunca `edit`).
  if (isOrdersPermissionKey(module)) return permissions?.[module] ?? "none";
  return permissions?.[module] ?? "edit";
}

export function canView(level: PermissionLevel) {
  return level === "view" || level === "edit";
}

export function canEdit(level: PermissionLevel) {
  return level === "edit";
}
