// Domínio de pedidos (Fase 4) — espelho puro das regras do backend.
// O banco é a fonte da verdade: RPCs `ped_*` calculam totais e validam transições.
// Este módulo existe para UI (labels, habilitar botões) e testes.

export const ORDER_STATUSES = [
  "pending_acceptance",
  "accepted",
  "preparation_started",
  "ready",
  "awaiting_pickup",
  "dispatched",
  "delivered",
  "completed",
  "cancellation_requested",
  "cancelled",
  "partially_refunded",
  "refunded",
  "failed",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending_acceptance: "Aguardando aceite",
  accepted: "Aceito",
  preparation_started: "Em produção",
  ready: "Pronto",
  awaiting_pickup: "Aguardando retirada",
  dispatched: "Saiu para entrega",
  delivered: "Entregue",
  completed: "Concluído",
  cancellation_requested: "Cancelamento solicitado",
  cancelled: "Cancelado",
  partially_refunded: "Estornado parcialmente",
  refunded: "Estornado",
  failed: "Falhou",
};

/** Transições permitidas — idêntico a `public.ped_order_transition_allowed`. */
export const ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  pending_acceptance: ["accepted", "cancelled", "failed"],
  accepted: ["preparation_started", "ready", "cancellation_requested", "cancelled", "failed"],
  preparation_started: ["ready", "cancellation_requested", "cancelled", "failed"],
  ready: ["awaiting_pickup", "dispatched", "delivered", "completed", "cancellation_requested", "cancelled"],
  awaiting_pickup: ["delivered", "completed", "cancellation_requested", "cancelled"],
  dispatched: ["delivered", "failed", "cancellation_requested"],
  delivered: ["completed", "partially_refunded", "refunded"],
  completed: ["partially_refunded", "refunded"],
  cancellation_requested: ["cancelled", "accepted", "preparation_started", "ready"],
  cancelled: ["refunded", "partially_refunded"],
  partially_refunded: ["refunded"],
  refunded: [],
  failed: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return (ORDER_TRANSITIONS[from] ?? []).includes(to);
}

export const ORDER_OPEN_STATUSES: readonly OrderStatus[] = [
  "pending_acceptance",
  "accepted",
  "preparation_started",
  "ready",
  "awaiting_pickup",
  "dispatched",
  "cancellation_requested",
];

export function isOrderOpen(status: OrderStatus): boolean {
  return ORDER_OPEN_STATUSES.includes(status);
}

export function isOrderFinal(status: OrderStatus): boolean {
  return ORDER_TRANSITIONS[status].length === 0 || status === "completed" || status === "cancelled";
}

/** Permissão exigida para chegar a cada estado (espelha as RPCs). */
export function operationForStatus(to: OrderStatus): string {
  switch (to) {
    case "accepted":
      return "orders.accept";
    case "preparation_started":
    case "ready":
      return "orders.prepare";
    case "awaiting_pickup":
    case "dispatched":
    case "delivered":
      return "orders.dispatch";
    case "cancelled":
      return "orders.cancel";
    case "refunded":
    case "partially_refunded":
      return "orders.refund";
    default:
      return "orders.manage";
  }
}

// ------------------------------------------------------------ totais (conferência)
export interface OrderItemInput {
  unitPrice: number; // centavos
  quantity: number;
  optionsPrice?: number; // centavos por unidade
}

export function itemTotalCents(item: OrderItemInput): number {
  const qty = Math.max(1, Math.trunc(item.quantity || 1));
  return (Math.trunc(item.unitPrice) + Math.trunc(item.optionsPrice ?? 0)) * qty;
}

export function orderTotalsCents(input: {
  items: OrderItemInput[];
  discount?: number;
  deliveryFee?: number;
  serviceFee?: number;
}): { subtotal: number; discount: number; deliveryFee: number; serviceFee: number; total: number } {
  const subtotal = input.items.reduce((acc, it) => acc + itemTotalCents(it), 0);
  const deliveryFee = Math.max(0, Math.trunc(input.deliveryFee ?? 0));
  const serviceFee = Math.max(0, Math.trunc(input.serviceFee ?? 0));
  const discount = Math.min(Math.max(0, Math.trunc(input.discount ?? 0)), subtotal + deliveryFee + serviceFee);
  return { subtotal, discount, deliveryFee, serviceFee, total: subtotal + deliveryFee + serviceFee - discount };
}
