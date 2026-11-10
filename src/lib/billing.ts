const BRL_FORMATTER = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Formata um valor em reais (number) como moeda BRL: "R$ 1.234,56".
 * Convenção única do app — use em todos os displays de moeda.
 */
export function formatBRL(value: number | null | undefined): string {
  return BRL_FORMATTER.format(Number(value ?? 0));
}

/** Formata centavos (inteiro) como moeda BRL: "R$ 1.234,56". */
export function formatCents(cents: number | null | undefined): string {
  return BRL_FORMATTER.format(Number(cents ?? 0) / 100);
}

export function formatLimit(value: number | undefined | null): string {
  if (value === undefined || value === null) return "—";
  if (value === -1) return "Ilimitado";
  return value.toLocaleString("pt-BR");
}

/**
 * Plano cobrado por colaborador ativo (Enterprise do Pessoas): devolve o valor por
 * colaborador e a franquia mínima da base. Planos de franquia fixa devolvem null.
 */
export function precoPorColaborador(features: unknown): { unitarioCents: number; minimo: number; baseCents: number } | null {
  if (!features || typeof features !== "object") return null;
  const f = features as Record<string, unknown>;
  const unit = Number(f.price_per_collaborator_cents);
  if (!Number.isFinite(unit) || unit <= 0) return null;
  const min = Math.max(1, Math.floor(Number(f.min_collaborators) || 1));
  return { unitarioCents: Math.round(unit), minimo: min, baseCents: Math.round(unit) * min };
}

/** Mensalidade estimada de um plano por colaborador para a quantidade de ativos (nunca abaixo da base). */
export function mensalidadePorColaborador(features: unknown, ativos: number): number | null {
  const p = precoPorColaborador(features);
  if (!p) return null;
  return Math.max(p.minimo, Math.max(0, Math.floor(ativos))) * p.unitarioCents;
}

export const SUBSCRIPTION_STATUS_LABELS: Record<string, string> = {
  trialing: "Em Trial",
  active: "Ativa",
  past_due: "Atrasada",
  canceled: "Cancelada",
  expired: "Expirada",
  pending: "Pendente",
  grace: "Em carência",
};

export const INVOICE_STATUS_LABELS: Record<string, string> = {
  draft: "Rascunho",
  open: "Aberta",
  paid: "Paga",
  overdue: "Vencida",
  canceled: "Cancelada",
  refunded: "Reembolsada",
};

export const SUBSCRIPTION_STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  trialing: "secondary",
  active: "default",
  past_due: "destructive",
  canceled: "outline",
  expired: "outline",
  pending: "secondary",
  grace: "secondary",
};

export const INVOICE_STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  draft: "outline",
  open: "secondary",
  paid: "default",
  overdue: "destructive",
  canceled: "outline",
  refunded: "outline",
};

export function isExempt(sub: { is_exempt?: boolean | null; exempt_until?: string | null } | null | undefined): boolean {
  if (!sub?.is_exempt) return false;
  if (!sub.exempt_until) return true;
  return new Date(sub.exempt_until) > new Date();
}

export function exemptionLabel(sub: { is_exempt?: boolean | null; exempt_until?: string | null } | null | undefined): string | null {
  if (!isExempt(sub)) return null;
  if (!sub?.exempt_until) return "Isento (permanente)";
  const d = new Date(sub.exempt_until);
  return `Isento até ${d.toLocaleDateString("pt-BR")}`;
}

