import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { subscribeRealtime } from "@/lib/realtimeHub";
import type { OrderStatus } from "@/lib/orders/orders";
import type { Deadlines } from "@/lib/orders/board";
import { DEFAULT_DEADLINES } from "@/lib/orders/board";
import type { FulfillmentMode, OrderChannel } from "@/lib/orders/units";

export const ORDERS_BOARD_KEY = "orders-board";

export interface BoardOrder {
  id: string;
  company_id: string;
  unit_id: string;
  channel_id: string | null;
  display_number: number;
  order_type: FulfillmentMode;
  order_timing: "immediate" | "scheduled";
  status: OrderStatus;
  payment_status: string;
  customer_id: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  notes: string | null;
  subtotal: number;
  discount_amount: number;
  delivery_fee: number;
  service_fee: number;
  total_amount: number;
  original_total_amount: number;
  placed_at: string;
  accepted_at: string | null;
  ready_at: string | null;
  dispatched_at: string | null;
  delivered_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  scheduled_start_at: string | null;
  version: number;
  is_test: boolean;
  items_count: number;
  items_preview: string[];
}

const BOARD_STATUSES: OrderStatus[] = [
  "pending_acceptance",
  "accepted",
  "preparation_started",
  "ready",
  "awaiting_pickup",
  "dispatched",
  "cancellation_requested",
  "delivered",
  "completed",
];

/** Canais de pedido cadastrados na empresa. */
export function useOrdersChannels() {
  const { contextType, selectedCompanyId } = useCompanyContext();
  return useQuery({
    queryKey: [ORDERS_BOARD_KEY, "channels", selectedCompanyId],
    enabled: contextType === "pj" && !!selectedCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ped_order_channels")
        .select("id, code, name, kind, is_active, is_default")
        .eq("company_id", selectedCompanyId!)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

/**
 * Fila operacional da unidade.
 * O Realtime apenas invalida a query — a consistência vem sempre do banco.
 */
export function useOrdersBoard(unitId: string | null, options?: { includeTest?: boolean }) {
  const { selectedCompanyId } = useCompanyContext();
  const queryClient = useQueryClient();
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  const [lastEventAt, setLastEventAt] = useState<number | null>(null);

  const includeTest = options?.includeTest ?? true;
  const queryKey = useMemo(
    () => [ORDERS_BOARD_KEY, "orders", selectedCompanyId, unitId, includeTest],
    [selectedCompanyId, unitId, includeTest],
  );

  const query = useQuery({
    queryKey,
    enabled: !!selectedCompanyId && !!unitId,
    // Realtime pode falhar (rede/offline): o polling garante consistência.
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<BoardOrder[]> => {
      const { data, error } = await supabase
        .from("ped_orders")
        .select("*, ped_order_items(name_snapshot, quantity)")
        .eq("company_id", selectedCompanyId!)
        .eq("unit_id", unitId!)
        .in("status", BOARD_STATUSES)
        .gte("placed_at", new Date(Date.now() - 36 * 3_600_000).toISOString())
        .order("placed_at", { ascending: true })
        .limit(400);
      if (error) throw error;

      return (data ?? [])
        .map((row) => {
          const { ped_order_items: items, ...order } = row as typeof row & {
            ped_order_items: { name_snapshot: string; quantity: number }[];
          };
          const list = items ?? [];
          return {
            ...order,
            items_count: list.reduce((acc, i) => acc + (i.quantity ?? 0), 0),
            items_preview: list.slice(0, 3).map((i) => `${i.quantity}× ${i.name_snapshot}`),
          } as BoardOrder;
        })
        .filter((o) => (includeTest ? true : !o.is_test));
    },
  });

  // Realtime filtrado por unidade (RLS ainda vale no servidor).
  useEffect(() => {
    if (!unitId) return;
    const invalidate = () => {
      setLastEventAt(Date.now());
      queryClient.invalidateQueries({ queryKey: [ORDERS_BOARD_KEY, "orders"] });
    };
    const offOrders = subscribeRealtime("ped_orders", `unit_id=eq.${unitId}`, invalidate);
    return () => {
      offOrders();
    };
  }, [unitId, queryClient]);

  useEffect(() => {
    const goOnline = () => {
      setOnline(true);
      queryClient.invalidateQueries({ queryKey: [ORDERS_BOARD_KEY] });
    };
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, [queryClient]);

  return {
    orders: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
    isFetching: query.isFetching,
    online,
    lastEventAt,
  };
}

/** Prazos configuráveis da unidade (nunca valores fixos de marketplace). */
export function useUnitDeadlines(unit?: {
  prep_time_minutes?: number | null;
  accept_deadline_minutes?: number | null;
  delay_tolerance_minutes?: number | null;
  pickup_deadline_minutes?: number | null;
} | null): Deadlines {
  return useMemo(
    () => ({
      acceptMinutes: unit?.accept_deadline_minutes ?? DEFAULT_DEADLINES.acceptMinutes,
      prepMinutes: unit?.prep_time_minutes ?? DEFAULT_DEADLINES.prepMinutes,
      pickupMinutes: unit?.pickup_deadline_minutes ?? DEFAULT_DEADLINES.pickupMinutes,
      delayToleranceMinutes: unit?.delay_tolerance_minutes ?? DEFAULT_DEADLINES.delayToleranceMinutes,
    }),
    [unit],
  );
}

/** Detalhes completos do pedido selecionado (itens, complementos, histórico, entrega). */
export function useOrderDetail(orderId: string | null) {
  return useQuery({
    queryKey: [ORDERS_BOARD_KEY, "detail", orderId],
    enabled: !!orderId,
    queryFn: async () => {
      const [items, options, history, delivery, payments, adjustments] = await Promise.all([
        supabase
          .from("ped_order_items")
          .select("id, name_snapshot, description_snapshot, variant_name_snapshot, quantity, unit_price, options_price, total_price, notes, sort_order")
          .eq("order_id", orderId!)
          .order("sort_order"),
        supabase
          .from("ped_order_item_options")
          .select("id, item_id, group_name_snapshot, name_snapshot, quantity, total_price")
          .eq("order_id", orderId!),
        supabase
          .from("ped_order_status_history")
          .select("id, from_status, to_status, source, reason, created_at, changed_by")
          .eq("order_id", orderId!)
          .order("created_at", { ascending: true }),
        supabase
          .from("ped_order_deliveries")
          .select("id, status, courier_name, courier_phone, address, fee_amount, assigned_at, delivered_at")
          .eq("order_id", orderId!)
          .maybeSingle(),
        supabase
          .from("ped_order_payments")
          .select("id, kind, amount, refunded_amount, status, paid_at")
          .eq("order_id", orderId!),
        supabase
          .from("ped_order_adjustments")
          .select("id, kind, amount, reason, total_before, total_after, created_at")
          .eq("order_id", orderId!)
          .order("created_at", { ascending: true }),
      ]);
      if (items.error) throw items.error;
      if (options.error) throw options.error;
      if (history.error) throw history.error;
      if (payments.error) throw payments.error;
      if (adjustments.error) throw adjustments.error;

      return {
        items: items.data ?? [],
        options: options.data ?? [],
        history: history.data ?? [],
        // entrega pode estar bloqueada por RLS (cozinha) — tratamos como ausente
        delivery: delivery.error ? null : delivery.data,
        payments: payments.data ?? [],
        adjustments: adjustments.data ?? [],
      };
    },
  });
}

// ------------------------------------------------------------------ ações (RPCs da Fase 4)
export type OrderAction =
  | "accept"
  | "start"
  | "ready"
  | "await_pickup"
  | "dispatch"
  | "deliver"
  | "complete"
  | "request_cancel"
  | "cancel";

interface ActionInput {
  orderId: string;
  action: OrderAction;
  version: number;
  reason?: string;
  courierName?: string;
}

interface RpcResult {
  success: boolean;
  code: string;
  message: string;
  status?: OrderStatus;
  version?: number;
}

function newIdempotencyKey(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

/**
 * Toda mudança de status passa pelas RPCs do backend — nunca `update` direto.
 * Envia versão esperada (concorrência) e chave de idempotência (duplo clique).
 */
export function useOrderAction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ orderId, action, version, reason, courierName }: ActionInput): Promise<RpcResult> => {
      const key = newIdempotencyKey();
      const base = { p_order_id: orderId, p_expected_version: version, p_idempotency_key: key };

      const call = async () => {
        switch (action) {
          case "accept":
            return supabase.rpc("ped_accept_order", base);
          case "start":
            return supabase.rpc("ped_start_order_preparation", base);
          case "ready":
            return supabase.rpc("ped_mark_order_ready", base);
          case "await_pickup":
            return supabase.rpc("ped_await_order_pickup", base);
          case "dispatch":
            return supabase.rpc("ped_dispatch_order", {
              p_order_id: orderId,
              p_expected_version: version,
              p_courier_user_id: null,
              p_courier_name: courierName ?? null,
              p_idempotency_key: key,
            });
          case "deliver":
            return supabase.rpc("ped_mark_order_delivered", base);
          case "complete":
            return supabase.rpc("ped_complete_order", base);
          case "request_cancel":
            return supabase.rpc("ped_request_order_cancellation", {
              p_order_id: orderId,
              p_reason: reason ?? "",
              p_expected_version: version,
              p_idempotency_key: key,
            });
          case "cancel":
            return supabase.rpc("ped_cancel_order", {
              p_order_id: orderId,
              p_reason: reason ?? "",
              p_expected_version: version,
              p_idempotency_key: key,
            });
        }
      };

      const { data, error } = await call();
      if (error) throw error;
      return data as unknown as RpcResult;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: [ORDERS_BOARD_KEY] });
      if (!result?.success) {
        toast.error(result?.message ?? "Não foi possível atualizar o pedido.");
        return;
      }
      if (result.code === "already_applied" || result.code === "already_in_status") {
        toast.info(result.message);
        return;
      }
      toast.success(result.message ?? "Pedido atualizado.");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Falha ao atualizar o pedido.");
    },
  });
}

export interface ManualOrderItemInput {
  product_id: string;
  quantity: number;
  variant_id?: string | null;
  notes?: string | null;
  options?: { option_id: string; quantity: number }[];
}

export interface ManualOrderInput {
  unitId: string;
  orderType: FulfillmentMode;
  channelId?: string | null;
  items: ManualOrderItemInput[];
  customerId?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  notes?: string | null;
  discountCents?: number;
  deliveryFeeCents?: number;
  serviceFeeCents?: number;
  address?: Record<string, string> | null;
  isTest?: boolean;
}

/** Pedido manual (balcão, telefone, WhatsApp, mesa, retirada, entrega). */
export function useCreateManualOrder() {
  const queryClient = useQueryClient();
  const [idempotencyKey, setKey] = useState(() => newIdempotencyKey());
  const resetKey = useCallback(() => setKey(newIdempotencyKey()), []);

  const mutation = useMutation({
    mutationFn: async (input: ManualOrderInput): Promise<RpcResult & { display_number?: number }> => {
      const { data, error } = await supabase.rpc("ped_create_order", {
        p_unit_id: input.unitId,
        p_items: input.items as unknown as never,
        p_order_type: input.orderType,
        p_channel_id: input.channelId ?? null,
        p_customer_id: input.customerId ?? null,
        p_customer_name: input.customerName ?? null,
        p_customer_phone: input.customerPhone ?? null,
        p_notes: input.notes ?? null,
        p_discount_amount: input.discountCents ?? 0,
        p_delivery_fee: input.deliveryFeeCents ?? 0,
        p_service_fee: input.serviceFeeCents ?? 0,
        p_order_timing: "immediate",
        p_delivery: (input.address ?? null) as unknown as never,
        p_is_test: input.isTest ?? false,
        p_idempotency_key: idempotencyKey,
      });
      if (error) throw error;
      return data as unknown as RpcResult & { display_number?: number };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: [ORDERS_BOARD_KEY] });
      if (!result?.success) {
        toast.error(result?.message ?? "Não foi possível criar o pedido.");
        return;
      }
      toast.success(
        result.display_number ? `Pedido #${result.display_number} criado.` : "Pedido criado.",
      );
      resetKey();
    },
    onError: (error: Error) => toast.error(error.message || "Falha ao criar o pedido."),
  });

  return { ...mutation, resetKey };
}
