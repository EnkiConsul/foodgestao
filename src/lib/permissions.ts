// Module-level permission system for company members.
// Keys are stable strings used in the DB column `company_members.permissions` (jsonb).

export type PermissionLevel = "none" | "view" | "edit";

export type ModuleKey =
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
};

export const ALL_MODULES = Object.keys(MODULE_LABELS) as ModuleKey[];

export type CompanyRole = "owner" | "admin" | "member" | "viewer";

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
  return permissions?.[module] ?? "edit";
}

export function canView(level: PermissionLevel) {
  return level === "view" || level === "edit";
}

export function canEdit(level: PermissionLevel) {
  return level === "edit";
}
