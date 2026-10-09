// Backoffice Cliente 360: tipos e regras de leitura das contas de cobrança.
export type C360Empresa = { id: string; nome: string; fantasia: string | null; cnpj: string | null; desde: string };
export type C360Assinatura = {
  id: string; module: "financeiro" | "pessoas" | string; plano: string; plan_id: string; status: string;
  billing_cycle: string | null; is_exempt: boolean; exempt_until: string | null; grace_ends_at: string | null;
  current_period_end: string | null; created_at: string; mrr_cents: number;
  colab_limite: number | null; colab_uso: number | null;
  grant_ativo: { tipo: string; motivo: string; ends_at: string | null } | null;
};
export type C360Conta = {
  id: string; nome: string; tipo: "empresa" | "grupo"; documento: string | null; email_cobranca: string | null;
  created_at: string; is_internal: boolean; internal_reason: string | null; internal_marked_at: string | null;
  titular: { user_id: string; nome: string | null } | null;
  empresas: C360Empresa[];
  admins: { user_id: string; nome: string | null; role: string }[];
  colaboradores_ativos: number; colaboradores_portal: number;
  assinaturas: C360Assinatura[];
  proxima_fatura: { id: string; due_date: string; amount_cents: number; status: string; url: string | null } | null;
  inadimplente: boolean;
};

export const MODULOS = [
  { key: "financeiro", label: "Financeiro 360°" },
  { key: "pessoas", label: "Pessoas 360°" },
] as const;

const encerrado = (s: string) => s === "canceled" || s === "expired";

/** Assinatura vigente do módulo (a mais recente não encerrada; senão a mais recente). */
export function assinaturaDoModulo(c: C360Conta, mod: string): C360Assinatura | null {
  const doMod = c.assinaturas.filter((s) => s.module === mod);
  return doMod.find((s) => !encerrado(s.status)) ?? doMod[0] ?? null;
}

export const temEmpresa = (c: C360Conta) => c.empresas.length > 0;
export const semAssinatura = (c: C360Conta) => temEmpresa(c) && c.assinaturas.length === 0;
export const semAcessoV2 = (c: C360Conta) =>
  temEmpresa(c) && c.assinaturas.length > 0 && c.assinaturas.every((s) => encerrado(s.status));
export const ehCliente = (c: C360Conta) => temEmpresa(c) && !c.is_internal;
export const modulosAtivos = (c: C360Conta) =>
  MODULOS.filter((m) => { const s = assinaturaDoModulo(c, m.key); return s && !encerrado(s.status); }).length;

/** MRR potencial: valor mensal sem concessões, só de contas cliente (internas fora). */
export const mrrPotencial = (c: C360Conta) =>
  c.is_internal ? 0 : c.assinaturas.filter((s) => !encerrado(s.status)).reduce((t, s) => t + (s.mrr_cents || 0), 0);

export function emCortesia(s: C360Assinatura | null) {
  return !!s && s.is_exempt && !encerrado(s.status);
}

export function cortesiaVence30(c: C360Conta) {
  const lim = Date.now() + 30 * 86400_000;
  return c.assinaturas.some((s) => emCortesia(s) && s.exempt_until && new Date(s.exempt_until).getTime() <= lim);
}

export const STATUS_LABEL: Record<string, string> = {
  active: "Ativo", trialing: "Teste", past_due: "Em atraso", canceled: "Cancelado",
  expired: "Expirado", pending: "Pendente", grace: "Carência",
};

/** Identificador para desambiguar nomes iguais: CNPJ formatado ou 8 primeiros caracteres do ID. */
export function idCurto(cnpj: string | null | undefined, id: string) {
  const d = (cnpj ?? "").replace(/\D/g, "");
  if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  return id.slice(0, 8);
}

export const brl = (cents: number | null | undefined) =>
  ((cents ?? 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const dataBR = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—";

/** Data civil escolhida -> 23:59:59 em Brasília (ISO UTC). */
export const fimDoDiaBR = (yyyyMmDd: string) => new Date(`${yyyyMmDd}T23:59:59-03:00`).toISOString();
