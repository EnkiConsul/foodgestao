import { formatLimit } from "@/lib/billing";

export type PlanFeatureMap = Record<string, unknown>;

export type MatrixRow = {
  label: string;
  strong?: boolean;
  value: (f: PlanFeatureMap) => string;
};

const num = (f: PlanFeatureMap, key: string) =>
  formatLimit(typeof f[key] === "number" ? (f[key] as number) : null);

/** Linhas do comparativo completo de planos (módulo Financeiro). */
export const PLAN_MATRIX_ROWS: MatrixRow[] = [
  { label: "Perfil indicado", strong: true, value: (f) => String(f.profile ?? "—") },
  { label: "Empresas/CNPJs", strong: true, value: (f) => num(f, "max_companies") },
  { label: "Usuários", strong: true, value: (f) => num(f, "max_users_per_company") },
  { label: "Acesso gratuito para contador", strong: true, value: (f) => num(f, "max_accountant_seats") },
  { label: "Conexões Open Finance", strong: true, value: (f) => num(f, "max_open_finance_connections") },
  {
    label: "Lançamentos financeiros",
    strong: true,
    value: (f) => (f.max_transactions_per_month === -1 ? "Ilimitados" : num(f, "max_transactions_per_month")),
  },
  { label: "Contas a pagar e receber", value: () => "Incluído" },
  { label: "Lançamentos bancários automáticos", value: () => "Incluído" },
  { label: "Conciliação bancária", value: () => "Automática" },
  { label: "Fluxo de caixa", value: () => "Incluído" },
  { label: "DRE gerencial", value: () => "Incluído" },
  { label: "Categorias e subcategorias", value: () => "Incluído" },
  { label: "Código contábil nas categorias", value: () => "Incluído" },
  { label: "Exportação para contabilidade", value: (f) => (f.accounting_export ? "Incluído" : "—") },
  { label: "Relatórios", value: () => "Incluído" },
  {
    label: "Alertas pelo WhatsApp",
    value: (f) =>
      typeof f.whatsapp_alerts_per_month === "number"
        ? `${f.whatsapp_alerts_per_month}/mês por empresa`
        : "—",
  },
  { label: "Agente de IA", value: (f) => (f.ai_enabled ? "Incluído" : "—") },
  { label: "Suporte", value: () => "Incluído" },
];
