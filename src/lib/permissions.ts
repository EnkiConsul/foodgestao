// Sistema de permissões por empresa.
// Guardado em `company_members.permissions` (jsonb). Financeiro usa chaves
// simples (legado); Pessoas 360° usa "dp.*" e Menu Conta usa "conta.*".
// A mesma regra é conferida no banco pela função `tem_permissao`.

export type PermissionLevel = "none" | "consulta" | "inclusao" | "alteracao" | "total";
/** Valores antigos ainda aceitos na leitura. */
type LegacyLevel = "view" | "edit";

export const LEVELS: { value: PermissionLevel; label: string; short: string }[] = [
  { value: "none", label: "Sem acesso", short: "Sem" },
  { value: "consulta", label: "Consulta", short: "Consulta" },
  { value: "inclusao", label: "Inclusão", short: "Inclusão" },
  { value: "alteracao", label: "Alteração", short: "Alteração" },
  { value: "total", label: "Total", short: "Total" },
];

const RANK: Record<PermissionLevel, number> = { none: 0, consulta: 1, inclusao: 2, alteracao: 3, total: 4 };

export function normalizeLevel(v: string | null | undefined): PermissionLevel | null {
  if (!v) return null;
  if (v === "view") return "consulta";
  if (v === "edit") return "total";
  return (v in RANK ? v : null) as PermissionLevel | null;
}

export type ModuloKey = "financeiro" | "pessoas" | "conta";
export type ModulosMap = Record<ModuloKey, boolean>;
export const MODULOS: { key: ModuloKey; label: string; descricao: string }[] = [
  { key: "financeiro", label: "Financeiro", descricao: "Lançamentos, contas, cartões, conciliação, relatórios e fluxo de caixa" },
  { key: "pessoas", label: "Pessoas 360°", descricao: "Colaboradores, escalas, folgas, férias, convocações e documentos" },
  { key: "conta", label: "Menu Conta", descricao: "Dados da empresa, usuários, assinatura e auditoria" },
];
export const MODULOS_TODOS: ModulosMap = { financeiro: true, pessoas: true, conta: true };

export type FinanceModuleKey =
  | "dashboard" | "transactions" | "accounts" | "credit_cards" | "conciliacao"
  | "categories" | "contacts" | "payment_methods" | "reports" | "cash_flow" | "attachments";
export type DpItemKey =
  | "dp.colaboradores" | "dp.escalas" | "dp.folgas" | "dp.ferias" | "dp.convocacoes"
  | "dp.ocorrencias" | "dp.documentos" | "dp.avisos" | "dp.beneficios" | "dp.cadastros" | "dp.relatorios";
export type ContaItemKey = "conta.empresa" | "conta.usuarios" | "conta.assinatura" | "conta.auditoria";
export type ModuleKey = FinanceModuleKey | DpItemKey | ContaItemKey;

export const MODULE_LABELS: Record<ModuleKey, string> = {
  dashboard: "Dashboard",
  transactions: "Lançamentos (Contas a Pagar/Receber)",
  accounts: "Contas Financeiras",
  credit_cards: "Cartões de Crédito",
  conciliacao: "Conciliação / Open Finance",
  categories: "Categorias",
  contacts: "Contatos",
  payment_methods: "Formas de Pagamento",
  reports: "Relatórios",
  cash_flow: "Fluxo de Caixa",
  attachments: "Anexos",
  "dp.colaboradores": "Colaboradores",
  "dp.escalas": "Escalas",
  "dp.folgas": "Folgas",
  "dp.ferias": "Férias",
  "dp.convocacoes": "Convocações",
  "dp.ocorrencias": "Ocorrências e Atestados",
  "dp.documentos": "Documentos",
  "dp.avisos": "Avisos e Comunicação",
  "dp.beneficios": "Benefícios e Vales",
  "dp.cadastros": "Cargos, Setores e Unidades",
  "dp.relatorios": "Relatórios de Pessoas",
  "conta.empresa": "Dados da Empresa",
  "conta.usuarios": "Usuários e Permissões",
  "conta.assinatura": "Assinatura e Faturas",
  "conta.auditoria": "Auditoria",
};

export const FINANCE_MODULES: FinanceModuleKey[] = [
  "dashboard", "transactions", "accounts", "credit_cards", "conciliacao",
  "categories", "contacts", "payment_methods", "reports", "cash_flow", "attachments",
];
export const DP_ITEMS: DpItemKey[] = [
  "dp.colaboradores", "dp.escalas", "dp.folgas", "dp.ferias", "dp.convocacoes",
  "dp.ocorrencias", "dp.documentos", "dp.avisos", "dp.beneficios", "dp.cadastros", "dp.relatorios",
];
export const CONTA_ITEMS: ContaItemKey[] = ["conta.empresa", "conta.usuarios", "conta.assinatura", "conta.auditoria"];

export const SECTIONS: { modulo: ModuloKey; title: string; items: readonly ModuleKey[] }[] = [
  { modulo: "financeiro", title: "Financeiro", items: FINANCE_MODULES },
  { modulo: "pessoas", title: "Pessoas 360°", items: DP_ITEMS },
  { modulo: "conta", title: "Menu Conta", items: CONTA_ITEMS },
];

export const ALL_MODULES = [...FINANCE_MODULES, ...DP_ITEMS, ...CONTA_ITEMS] as ModuleKey[];

export function moduloDoItem(item: ModuleKey): ModuloKey {
  if (item.startsWith("dp.")) return "pessoas";
  if (item.startsWith("conta.")) return "conta";
  return "financeiro";
}

export type CompanyRole = "owner" | "admin" | "member" | "viewer" | "contabilidade";

export type PerfilKey =
  | "dono" | "administrador" | "gerente" | "assistente_financeiro"
  | "rh_dp" | "colaborador" | "contabilidade" | "visualizador" | "personalizado";

export interface PerfilPreset {
  key: PerfilKey;
  label: string;
  descricao: string;
  role: CompanyRole;
  modulos: ModulosMap;
  ver_saldos: boolean;
  ver_salarios: boolean;
  permissions: PermissionsMap;
}

/** Módulos financeiros visíveis para o papel Contabilidade (somente leitura). */
export const ACCOUNTING_MODULES: FinanceModuleKey[] = [...FINANCE_MODULES];

export type PermissionsMap = Partial<Record<ModuleKey, PermissionLevel | LegacyLevel>>;

const fill = (items: readonly ModuleKey[], lvl: PermissionLevel): PermissionsMap =>
  Object.fromEntries(items.map((m) => [m, lvl])) as PermissionsMap;

export const PERFIS: PerfilPreset[] = [
  {
    key: "dono", label: "Dono", descricao: "Acesso total, inclusive gestão de outros donos",
    role: "owner", modulos: MODULOS_TODOS, ver_saldos: true, ver_salarios: true, permissions: fill(ALL_MODULES, "total"),
  },
  {
    key: "administrador", label: "Administrador", descricao: "Acesso total a todos os módulos",
    role: "admin", modulos: MODULOS_TODOS, ver_saldos: true, ver_salarios: true, permissions: fill(ALL_MODULES, "total"),
  },
  {
    key: "gerente", label: "Gerente", descricao: "Cuida da equipe e da operação, sem saldos nem salários",
    role: "member", modulos: { financeiro: false, pessoas: true, conta: false }, ver_saldos: false, ver_salarios: false,
    permissions: { ...fill(ALL_MODULES, "none"), ...fill(DP_ITEMS, "alteracao"), "dp.cadastros": "consulta", "dp.beneficios": "consulta", "dp.relatorios": "consulta" },
  },
  {
    key: "assistente_financeiro", label: "Assistente Financeiro", descricao: "Lança e concilia no Financeiro",
    role: "member", modulos: { financeiro: true, pessoas: false, conta: false }, ver_saldos: true, ver_salarios: false,
    permissions: { ...fill(ALL_MODULES, "none"), ...fill(FINANCE_MODULES, "alteracao"), reports: "consulta", cash_flow: "consulta", dashboard: "consulta" },
  },
  {
    key: "rh_dp", label: "RH / DP", descricao: "Gestão completa do Pessoas 360°, com salários",
    role: "member", modulos: { financeiro: false, pessoas: true, conta: false }, ver_saldos: false, ver_salarios: true,
    permissions: { ...fill(ALL_MODULES, "none"), ...fill(DP_ITEMS, "total") },
  },
  {
    key: "colaborador", label: "Colaborador", descricao: "Consulta avisos, escalas e documentos",
    role: "member", modulos: { financeiro: false, pessoas: true, conta: false }, ver_saldos: false, ver_salarios: false,
    permissions: { ...fill(ALL_MODULES, "none"), "dp.avisos": "consulta", "dp.escalas": "consulta", "dp.documentos": "consulta" },
  },
  {
    key: "contabilidade", label: "Contabilidade", descricao: "Somente leitura do Financeiro",
    role: "contabilidade", modulos: { financeiro: true, pessoas: false, conta: false }, ver_saldos: true, ver_salarios: false,
    permissions: { ...fill(ALL_MODULES, "none"), ...fill(FINANCE_MODULES, "consulta") },
  },
  {
    key: "visualizador", label: "Visualizador", descricao: "Somente leitura no Financeiro",
    role: "viewer", modulos: { financeiro: true, pessoas: false, conta: false }, ver_saldos: true, ver_salarios: false,
    permissions: { ...fill(ALL_MODULES, "none"), ...fill(FINANCE_MODULES, "consulta") },
  },
  {
    key: "personalizado", label: "Personalizado", descricao: "Você escolhe item por item",
    role: "member", modulos: MODULOS_TODOS, ver_saldos: true, ver_salarios: false,
    permissions: { ...fill(ALL_MODULES, "none"), ...fill(FINANCE_MODULES, "consulta") },
  },
];

export const PERFIL_LABELS = Object.fromEntries(PERFIS.map((p) => [p.key, p.label])) as Record<PerfilKey, string>;
export const getPerfil = (k: string | null | undefined) => PERFIS.find((p) => p.key === k) ?? PERFIS[PERFIS.length - 1];

export function perfilPadraoDoRole(role: CompanyRole): PerfilKey {
  return role === "owner" ? "dono" : role === "admin" ? "administrador" : role === "viewer" ? "visualizador"
    : role === "contabilidade" ? "contabilidade" : "personalizado";
}

export function getDefaultPermissions(role: CompanyRole): PermissionsMap {
  return getPerfil(perfilPadraoDoRole(role)).permissions;
}

/** Papéis cuja matriz é fixa (não editável). */
export const roleTemMatrizFixa = (role: CompanyRole) =>
  role === "owner" || role === "admin" || role === "viewer" || role === "contabilidade";

export function resolvePermission(
  role: CompanyRole | undefined,
  permissions: PermissionsMap | null | undefined,
  module: ModuleKey,
  modulos?: Partial<ModulosMap> | null,
  situacao?: string | null,
): PermissionLevel {
  if (!role || (situacao && situacao !== "ativo")) return "none";
  if (role === "owner" || role === "admin") return "total";
  const mod = moduloDoItem(module);
  if (modulos && modulos[mod] === false) return "none";
  if (role === "viewer" || role === "contabilidade") return mod === "financeiro" ? "consulta" : "none";
  const v = normalizeLevel(permissions?.[module] as string | undefined);
  // Membros antigos sem matriz mantêm o acesso do Financeiro que tinham.
  if (v == null) return mod === "financeiro" && (!permissions || Object.keys(permissions).length === 0) ? "total" : "none";
  return v;
}

export const atLeast = (level: PermissionLevel, required: PermissionLevel) => RANK[level] >= RANK[required];
export const canView = (level: PermissionLevel) => atLeast(level, "consulta");
export const canCreate = (level: PermissionLevel) => atLeast(level, "inclusao");
export const canEdit = (level: PermissionLevel) => atLeast(level, "alteracao");
export const canDelete = (level: PermissionLevel) => atLeast(level, "total");
