// Regras puras dos modos Cozinha e Expedição.
// Sem React, sem Supabase — testável isoladamente.

import type { OrderStatus } from "./orders";

export const PRINT_STATIONS = ["cozinha", "bar", "caixa", "expedicao"] as const;
export type PrintStation = (typeof PRINT_STATIONS)[number];

export const STATION_LABELS: Record<PrintStation, string> = {
  cozinha: "Cozinha",
  bar: "Bar",
  caixa: "Caixa",
  expedicao: "Expedição",
};

/** Permissão exigida para operar cada estação. */
export const STATION_PERMISSION: Record<PrintStation, string> = {
  cozinha: "orders.kitchen",
  bar: "orders.kitchen",
  caixa: "orders.print",
  expedicao: "orders.expedition",
};

export interface KitchenItem {
  id: string;
  name: string;
  quantity: number;
  variantName?: string | null;
  notes?: string | null;
  station?: PrintStation | null;
  preparedAt?: string | null;
  options?: { id: string; name: string; quantity: number; groupName?: string | null }[];
}

export interface KitchenTicketData {
  id: string;
  displayNumber: number;
  status: OrderStatus;
  orderType: string;
  placedAt: string;
  acceptedAt?: string | null;
  scheduledStartAt?: string | null;
  notes?: string | null;
  isTest?: boolean;
  items: KitchenItem[];
}

/** Estados que a cozinha acompanha (nunca pedidos finalizados ou cancelados). */
export const KITCHEN_STATUSES: readonly OrderStatus[] = [
  "accepted",
  "preparation_started",
  "ready",
];

/** Estados que a expedição acompanha. */
export const EXPEDITION_STATUSES: readonly OrderStatus[] = [
  "ready",
  "awaiting_pickup",
  "dispatched",
];

export function isKitchenStatus(status: OrderStatus): boolean {
  return KITCHEN_STATUSES.includes(status);
}

export function isExpeditionStatus(status: OrderStatus): boolean {
  return EXPEDITION_STATUSES.includes(status);
}

/**
 * Estação efetiva de um item: item > produto > categoria > cozinha.
 * Mantém o roteamento previsível quando o catálogo não define estação.
 */
export function resolveItemStation(
  item: { station?: PrintStation | null },
  productStation?: PrintStation | null,
  categoryStation?: PrintStation | null,
): PrintStation {
  return item.station ?? productStation ?? categoryStation ?? "cozinha";
}

/** Itens visíveis para a estação escolhida ("todas" mantém a comanda completa). */
export function itemsForStation(
  items: KitchenItem[],
  station: PrintStation | "all",
): KitchenItem[] {
  if (station === "all") return items;
  return items.filter((i) => (i.station ?? "cozinha") === station);
}

/** Comandas que têm ao menos um item da estação. */
export function ticketsForStation<T extends { items: KitchenItem[] }>(
  tickets: T[],
  station: PrintStation | "all",
): T[] {
  if (station === "all") return tickets;
  return tickets
    .map((t) => ({ ...t, items: itemsForStation(t.items, station) }))
    .filter((t) => t.items.length > 0);
}

export function pendingItemsCount(items: KitchenItem[]): number {
  return items.filter((i) => !i.preparedAt).length;
}

export function allItemsPrepared(items: KitchenItem[]): boolean {
  return items.length > 0 && items.every((i) => !!i.preparedAt);
}

/** Minutos desde o início da produção (ou desde o aceite). */
export function elapsedPrepMinutes(ticket: KitchenTicketData, now = Date.now()): number {
  const base = ticket.acceptedAt ?? ticket.placedAt;
  const started = new Date(base).getTime();
  if (Number.isNaN(started)) return 0;
  return Math.max(0, Math.floor((now - started) / 60_000));
}

export type KitchenPriority = "normal" | "attention" | "late";

export function kitchenPriority(
  ticket: KitchenTicketData,
  prepMinutes: number,
  now = Date.now(),
): KitchenPriority {
  const elapsed = elapsedPrepMinutes(ticket, now);
  if (elapsed > prepMinutes) return "late";
  if (elapsed >= Math.max(1, Math.round(prepMinutes * 0.7))) return "attention";
  return "normal";
}

/**
 * Ordena por prioridade operacional: atrasados primeiro, depois mais antigos.
 * Agendados que ainda não chegaram na janela vão para o fim.
 */
export function sortKitchenQueue(
  tickets: KitchenTicketData[],
  prepMinutes: number,
  now = Date.now(),
): KitchenTicketData[] {
  const weight: Record<KitchenPriority, number> = { late: 0, attention: 1, normal: 2 };
  return [...tickets].sort((a, b) => {
    const aFuture = a.scheduledStartAt ? new Date(a.scheduledStartAt).getTime() > now : false;
    const bFuture = b.scheduledStartAt ? new Date(b.scheduledStartAt).getTime() > now : false;
    if (aFuture !== bFuture) return aFuture ? 1 : -1;
    const pa = weight[kitchenPriority(a, prepMinutes, now)];
    const pb = weight[kitchenPriority(b, prepMinutes, now)];
    if (pa !== pb) return pa - pb;
    return new Date(a.placedAt).getTime() - new Date(b.placedAt).getTime();
  });
}

// ------------------------------------------------------------------ expedição
export interface ExpeditionChecklistState {
  itemsChecked: boolean;
  packagingChecked: boolean;
  drinksChecked: boolean;
}

export const EXPEDITION_CHECKS: readonly (keyof ExpeditionChecklistState)[] = [
  "itemsChecked",
  "packagingChecked",
  "drinksChecked",
];

export const EXPEDITION_CHECK_LABELS: Record<keyof ExpeditionChecklistState, string> = {
  itemsChecked: "Itens conferidos",
  packagingChecked: "Embalagens e utensílios",
  drinksChecked: "Bebidas e sobremesas",
};

export function canReleaseExpedition(
  state: ExpeditionChecklistState,
  required: boolean,
): boolean {
  if (!required) return true;
  return EXPEDITION_CHECKS.every((k) => state[k]);
}

/** Código curto de retirada — derivado do pedido, sem expor dados do cliente. */
export function pickupCode(orderId: string, displayNumber: number): string {
  const tail = orderId.replace(/[^0-9a-f]/gi, "").slice(-3).toUpperCase();
  return `${String(displayNumber).padStart(3, "0")}-${tail || "000"}`;
}

/** Ação principal de expedição por tipo de entrega. */
export function expeditionPrimaryLabel(orderType: string): string {
  return orderType === "delivery" ? "Conferido e liberado para entrega" : "Conferido e liberado";
}
