/**
 * Filtros adicionais do Relatório de Fluxo de Caixa.
 *
 * Mantém em um único lugar o formato dos filtros e a forma como eles são
 * aplicados na query de `transactions`, para que a matriz e o detalhamento
 * (drilldown) sempre usem exatamente as mesmas regras.
 */

export const FLUXO_SITUACOES = ["todos", "pagos", "a_vencer", "atrasados"] as const;
export type FluxoSituacao = (typeof FLUXO_SITUACOES)[number];

export type FluxoFiltros = {
  situacao: FluxoSituacao;
  accountId: string | null;
  paymentMethodId: string | null;
  creditCardId: string | null;
  costCenterId: string | null;
  contactId: string | null;
};

export const FLUXO_FILTROS_PADRAO: FluxoFiltros = {
  situacao: "todos",
  accountId: null,
  paymentMethodId: null,
  creditCardId: null,
  costCenterId: null,
  contactId: null,
};

export function countActiveFluxoFiltros(f: FluxoFiltros): number {
  return (
    (f.situacao !== "todos" ? 1 : 0) +
    (f.accountId ? 1 : 0) +
    (f.paymentMethodId ? 1 : 0) +
    (f.creditCardId ? 1 : 0) +
    (f.costCenterId ? 1 : 0) +
    (f.contactId ? 1 : 0)
  );
}

/** Chave estável para uso em queryKey do react-query. */
export function fluxoFiltrosKey(f: FluxoFiltros): string {
  return [
    f.situacao,
    f.accountId ?? "",
    f.paymentMethodId ?? "",
    f.creditCardId ?? "",
    f.costCenterId ?? "",
    f.contactId ?? "",
  ].join("|");
}

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Aplica os filtros em um `PostgrestFilterBuilder` de transactions.
 * Genérico para não acoplar aos tipos gerados do client.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyFluxoFiltros<T>(query: T, f: FluxoFiltros): T {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q = query as any;

  if (f.situacao === "pagos") {
    q = q.not("payment_date", "is", null);
  } else if (f.situacao === "a_vencer") {
    q = q.is("payment_date", null).or(`due_date.gte.${today()},due_date.is.null`);
  } else if (f.situacao === "atrasados") {
    q = q.is("payment_date", null).not("due_date", "is", null).lt("due_date", today());
  }

  if (f.accountId) q = q.eq("account_id", f.accountId);
  if (f.paymentMethodId) q = q.eq("payment_method_id", f.paymentMethodId);
  if (f.creditCardId) q = q.eq("credit_card_id", f.creditCardId);
  if (f.costCenterId) q = q.eq("cost_center_id", f.costCenterId);
  if (f.contactId) q = q.eq("contact_id", f.contactId);

  return q as T;
}

