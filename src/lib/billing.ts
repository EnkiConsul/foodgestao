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

export const SUBSCRIPTION_STATUS_LABELS: Record<string, string> = {
  trialing: "Em Trial",
  active: "Ativa",
  past_due: "Atrasada",
  canceled: "Cancelada",
  expired: "Expirada",
  pending: "Pendente",
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

