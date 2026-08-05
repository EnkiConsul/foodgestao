// Regras puras da Central de Pedidos (Fase 5).
// Nada de I/O aqui — apenas derivações usadas pela UI e cobertas por testes.

import type { OrderStatus } from "@/lib/orders/orders";
import { ORDER_STATUS_LABELS } from "@/lib/orders/orders";
import type { FulfillmentMode } from "@/lib/orders/units";

export type BoardColumnId = "novos" | "preparo" | "prontos" | "transporte" | "concluidos";

export interface BoardColumn {
  id: BoardColumnId;
  title: string;
  hint: string;
  statuses: readonly OrderStatus[];
}

export const BOARD_COLUMNS: readonly BoardColumn[] = [
  {
    id: "novos",
    title: "Novos",
    hint: "Aguardando aceite",
    statuses: ["pending_acceptance"],
  },
  {
    id: "preparo",
    title: "Em preparo",
    hint: "Aceitos e em produção",
    statuses: ["accepted", "preparation_started"],
  },
  {
    id: "prontos",
    title: "Prontos",
    hint: "Prontos para sair ou retirar",
    statuses: ["ready"],
  },
  {
    id: "transporte",
    title: "Entrega / retirada",
    hint: "Em rota ou aguardando o cliente",
    statuses: ["awaiting_pickup", "dispatched"],
  },
  {
    id: "concluidos",
    title: "Concluídos recentes",
    hint: "Entregues e finalizados",
    statuses: ["delivered", "completed"],
  },
] as const;

export function columnForStatus(status: OrderStatus): BoardColumnId | null {
  const col = BOARD_COLUMNS.find((c) => c.statuses.includes(status));
  return col?.id ?? null;
}

// ------------------------------------------------------------------ pendências
export type PendencyKind =
  | "item_unavailable"
  | "cancellation"
  | "payment"
  | "customer_waiting"
  | "delay"
  | "courier_waiting";

export const PENDENCY_LABELS: Record<PendencyKind, string> = {
  item_unavailable: "Item indisponível",
  cancellation: "Cancelamento",
  payment: "Pagamento",
  customer_waiting: "Cliente aguardando",
  delay: "Atraso",
  courier_waiting: "Entregador aguardando",
};

export interface OrderLike {
  status: OrderStatus;
  order_type: FulfillmentMode;
  payment_status: string;
  placed_at: string;
  accepted_at?: string | null;
  ready_at?: string | null;
  has_unavailable_item?: boolean;
  courier_waiting?: boolean;
}

export interface Deadlines {
  acceptMinutes: number;
  prepMinutes: number;
  pickupMinutes: number;
  delayToleranceMinutes: number;
}

export const DEFAULT_DEADLINES: Deadlines = {
  acceptMinutes: 5,
  prepMinutes: 30,
  pickupMinutes: 15,
  delayToleranceMinutes: 10,
};

const OPEN_FOR_DELAY: readonly OrderStatus[] = [
  "pending_acceptance",
  "accepted",
  "preparation_started",
  "ready",
  "awaiting_pickup",
  "dispatched",
];

/** Minutos decorridos entre `iso` e `now` (nunca negativo). */
export function minutesSince(iso: string | null | undefined, now: number = Date.now()): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.floor((now - t) / 60_000));
}

/** Minutos restantes para um prazo (negativo = estourado). */
export function minutesLeft(startIso: string | null | undefined, limitMinutes: number, now = Date.now()): number {
  if (!startIso) return limitMinutes;
  const t = new Date(startIso).getTime();
  if (!Number.isFinite(t)) return limitMinutes;
  return Math.round((t + limitMinutes * 60_000 - now) / 60_000);
}

export function pendenciesFor(order: OrderLike, deadlines: Deadlines, now = Date.now()): PendencyKind[] {
  const out: PendencyKind[] = [];

  if (order.has_unavailable_item) out.push("item_unavailable");
  if (order.status === "cancellation_requested") out.push("cancellation");
  if (order.payment_status === "failed" || order.payment_status === "pending") out.push("payment");

  if (order.status === "pending_acceptance" && minutesSince(order.placed_at, now) >= deadlines.acceptMinutes) {
    out.push("customer_waiting");
  }
  if (
    order.status === "ready" &&
    order.order_type !== "delivery" &&
    minutesSince(order.ready_at, now) >= deadlines.pickupMinutes
  ) {
    out.push("customer_waiting");
  }
  if (order.courier_waiting && order.status === "ready" && order.order_type === "delivery") {
    out.push("courier_waiting");
  }
  if (
    OPEN_FOR_DELAY.includes(order.status) &&
    minutesSince(order.placed_at, now) > deadlines.prepMinutes + deadlines.delayToleranceMinutes
  ) {
    out.push("delay");
  }

  return Array.from(new Set(out));
}

export type UrgencyLevel = "ok" | "attention" | "critical";

/** Urgência do cartão — sempre acompanhada de texto/ícone (nunca só cor). */
export function orderUrgency(order: OrderLike, deadlines: Deadlines, now = Date.now()): UrgencyLevel {
  const pend = pendenciesFor(order, deadlines, now);
  if (pend.includes("delay") || pend.includes("cancellation") || pend.includes("item_unavailable")) return "critical";
  if (order.status === "pending_acceptance") {
    const left = minutesLeft(order.placed_at, deadlines.acceptMinutes, now);
    if (left <= 0) return "critical";
    if (left <= 2) return "attention";
  }
  if (pend.length > 0) return "attention";
  return "ok";
}

/** Rótulo curto do cronômetro do cartão. */
export function timerLabel(order: OrderLike, deadlines: Deadlines, now = Date.now()): string {
  if (order.status === "pending_acceptance") {
    const left = minutesLeft(order.placed_at, deadlines.acceptMinutes, now);
    return left >= 0 ? `Aceitar em ${left} min` : `Aceite atrasado ${Math.abs(left)} min`;
  }
  if (order.status === "accepted" || order.status === "preparation_started") {
    const left = minutesLeft(order.accepted_at ?? order.placed_at, deadlines.prepMinutes, now);
    return left >= 0 ? `Preparo: ${left} min restantes` : `Preparo atrasado ${Math.abs(left)} min`;
  }
  if (order.status === "ready" && order.order_type !== "delivery") {
    const left = minutesLeft(order.ready_at, deadlines.pickupMinutes, now);
    return left >= 0 ? `Retirada em ${left} min` : `Aguardando retirada ${Math.abs(left)} min`;
  }
  return `${minutesSince(order.placed_at, now)} min do pedido`;
}

// ------------------------------------------------------------------ ação principal
export interface PrimaryAction {
  action:
    | "accept"
    | "start"
    | "ready"
    | "await_pickup"
    | "dispatch"
    | "deliver"
    | "complete"
    | "cancel";
  label: string;
}

export function primaryActionFor(order: OrderLike): PrimaryAction | null {
  switch (order.status) {
    case "pending_acceptance":
      return { action: "accept", label: "Aceitar pedido" };
    case "accepted":
      return { action: "start", label: "Iniciar preparo" };
    case "preparation_started":
      return { action: "ready", label: "Marcar pronto" };
    case "ready":
      return order.order_type === "delivery"
        ? { action: "dispatch", label: "Despachar entrega" }
        : { action: "await_pickup", label: "Chamar cliente" };
    case "awaiting_pickup":
      return { action: "deliver", label: "Entregue ao cliente" };
    case "dispatched":
      return { action: "deliver", label: "Confirmar entrega" };
    case "delivered":
      return { action: "complete", label: "Concluir pedido" };
    case "cancellation_requested":
      return { action: "cancel", label: "Confirmar cancelamento" };
    default:
      return null;
  }
}

// ------------------------------------------------------------------ apresentação
export function shortCustomerName(name: string | null | undefined): string {
  const clean = (name ?? "").trim();
  if (!clean) return "Cliente não identificado";
  const parts = clean.split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[1].charAt(0).toUpperCase()}.`;
}

/** Telefone mascarado para quem não tem `orders.customer_data`. */
export function maskPhone(phone: string | null | undefined, unmask: boolean): string {
  const clean = (phone ?? "").replace(/\D/g, "");
  if (!clean) return "—";
  if (unmask) return phone!.trim();
  return `•••• ${clean.slice(-4)}`;
}

/** Endereço mascarado conforme papel: cozinha vê apenas bairro/cidade. */
export function maskAddress(
  address: Record<string, unknown> | null | undefined,
  unmask: boolean,
): string {
  if (!address || Object.keys(address).length === 0) return "Sem endereço";
  const street = String(address.street ?? address.logradouro ?? "").trim();
  const number = String(address.number ?? address.numero ?? "").trim();
  const district = String(address.district ?? address.bairro ?? "").trim();
  const city = String(address.city ?? address.cidade ?? "").trim();
  const complement = String(address.complement ?? address.complemento ?? "").trim();

  if (!unmask) {
    return [district, city].filter(Boolean).join(" — ") || "Endereço protegido";
  }
  const line = [street, number].filter(Boolean).join(", ");
  return [line, complement, district, city].filter(Boolean).join(" — ") || "Endereço informado";
}

export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  pending: "A receber",
  authorized: "Autorizado",
  paid: "Pago",
  partially_refunded: "Estorno parcial",
  refunded: "Estornado",
  failed: "Falha no pagamento",
  cancelled: "Cancelado",
};

export const FULFILLMENT_LABELS: Record<string, string> = {
  delivery: "Entrega",
  pickup: "Retirada",
  counter: "Balcão",
  table: "Mesa",
  dine_in: "Consumo no local",
};

export const CHANNEL_LABELS: Record<string, string> = {
  balcao: "Balcão",
  link_proprio: "Link próprio",
  whatsapp: "WhatsApp",
  telefone: "Telefone",
  integracao: "Integração",
};

export function statusLabel(status: OrderStatus): string {
  return ORDER_STATUS_LABELS[status] ?? status;
}
