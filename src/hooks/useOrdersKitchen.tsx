import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { subscribeRealtime } from "@/lib/realtimeHub";
import type { OrderStatus } from "@/lib/orders/orders";
import {
  EXPEDITION_STATUSES,
  KITCHEN_STATUSES,
  type KitchenItem,
  type KitchenTicketData,
  type PrintStation,
} from "@/lib/orders/kitchen";
import {
  normalizeCopies,
  printIdempotencyKey,
  type PrintJobStatus,
} from "@/lib/orders/print";

export const KITCHEN_KEY = "orders-kitchen";
export const PRINT_KEY = "orders-print";

export interface PrintJob {
  id: string;
  order_id: string;
  unit_id: string;
  station: PrintStation;
  copies: number;
  status: PrintJobStatus;
  attempts: number;
  last_error: string | null;
  printer_name: string | null;
  is_reprint: boolean;
  reprint_of: string | null;
  reason: string | null;
  created_at: string;
  printed_at: string | null;
}

interface RpcResult {
  success: boolean;
  code: string;
  message: string;
}

/**
 * Fila de produção/expedição da unidade.
 * Traz apenas o necessário para operar — nenhum dado financeiro ou de endereço.
 */
export function useKitchenQueue(unitId: string | null, mode: "kitchen" | "expedition") {
  const { selectedCompanyId } = useCompanyContext();
  const queryClient = useQueryClient();
  const statuses = mode === "kitchen" ? KITCHEN_STATUSES : EXPEDITION_STATUSES;

  const query = useQuery({
    queryKey: [KITCHEN_KEY, mode, selectedCompanyId, unitId],
    enabled: !!selectedCompanyId && !!unitId,
    refetchInterval: 30_000,
    queryFn: async (): Promise<KitchenTicketData[]> => {
      const { data, error } = await supabase
        .from("ped_orders")
        .select(
          `id, display_number, status, order_type, placed_at, accepted_at, scheduled_start_at, notes, is_test,
           ped_order_items(id, name_snapshot, variant_name_snapshot, quantity, notes, station, prepared_at, sort_order,
             ped_order_item_options(id, name_snapshot, group_name_snapshot, quantity))`,
        )
        .eq("company_id", selectedCompanyId!)
        .eq("unit_id", unitId!)
        .in("status", statuses as unknown as OrderStatus[])
        .order("placed_at", { ascending: true })
        .limit(200);
      if (error) throw error;

      return (data ?? []).map((row) => {
        const items = (row.ped_order_items ?? []) as unknown as {
          id: string;
          name_snapshot: string;
          variant_name_snapshot: string | null;
          quantity: number;
          notes: string | null;
          station: PrintStation | null;
          prepared_at: string | null;
          sort_order: number;
          ped_order_item_options:
            | { id: string; name_snapshot: string; group_name_snapshot: string | null; quantity: number }[]
            | null;
        }[];

        return {
          id: row.id,
          displayNumber: row.display_number,
          status: row.status as OrderStatus,
          orderType: row.order_type as string,
          placedAt: row.placed_at,
          acceptedAt: row.accepted_at,
          scheduledStartAt: row.scheduled_start_at,
          notes: row.notes,
          isTest: row.is_test,
          items: [...items]
            .sort((a, b) => a.sort_order - b.sort_order)
            .map<KitchenItem>((i) => ({
              id: i.id,
              name: i.name_snapshot,
              quantity: i.quantity,
              variantName: i.variant_name_snapshot,
              notes: i.notes,
              station: i.station ?? "cozinha",
              preparedAt: i.prepared_at,
              options: (i.ped_order_item_options ?? []).map((o) => ({
                id: o.id,
                name: o.name_snapshot,
                quantity: o.quantity,
                groupName: o.group_name_snapshot,
              })),
            })),
        };
      });
    },
  });

  useEffect(() => {
    if (!unitId) return;
    const invalidate = () => queryClient.invalidateQueries({ queryKey: [KITCHEN_KEY] });
    const offOrders = subscribeRealtime("ped_orders", `unit_id=eq.${unitId}`, invalidate);
    return () => offOrders();
  }, [unitId, queryClient]);

  return query;
}

/** Marca (ou reabre) um item da comanda. */
export function useSetItemPrepared() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ itemId, prepared }: { itemId: string; prepared: boolean }) => {
      const { data, error } = await supabase.rpc("ped_set_order_item_prepared", {
        p_item_id: itemId,
        p_prepared: prepared,
      });
      if (error) throw error;
      return data as unknown as RpcResult;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: [KITCHEN_KEY] });
      if (!result?.success) toast.error(result?.message ?? "Não foi possível atualizar o item.");
    },
    onError: (error: Error) => toast.error(error.message || "Falha ao atualizar o item."),
  });
}

// ------------------------------------------------------------------ impressão
export function usePrintJobs(unitId: string | null, limit = 60) {
  const { selectedCompanyId } = useCompanyContext();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: [PRINT_KEY, selectedCompanyId, unitId, limit],
    enabled: !!selectedCompanyId && !!unitId,
    refetchInterval: 30_000,
    queryFn: async (): Promise<PrintJob[]> => {
      const { data, error } = await supabase
        .from("ped_print_jobs")
        .select(
          "id, order_id, unit_id, station, copies, status, attempts, last_error, printer_name, is_reprint, reprint_of, reason, created_at, printed_at",
        )
        .eq("company_id", selectedCompanyId!)
        .eq("unit_id", unitId!)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as unknown as PrintJob[];
    },
  });

  useEffect(() => {
    if (!unitId) return;
    const off = subscribeRealtime("ped_print_jobs", `unit_id=eq.${unitId}`, () =>
      queryClient.invalidateQueries({ queryKey: [PRINT_KEY] }),
    );
    return () => off();
  }, [unitId, queryClient]);

  return query;
}

export interface EnqueuePrintInput {
  orderId: string;
  station: PrintStation;
  status: string;
  copies?: number;
  printerName?: string | null;
  isReprint?: boolean;
  reason?: string | null;
  reprintOf?: string | null;
  reprintSeq?: number;
}

/** Registra a via na fila (idempotente por pedido+estação+status). */
export function useEnqueuePrintJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: EnqueuePrintInput) => {
      const { data, error } = await supabase.rpc("ped_enqueue_print_job", {
        p_order_id: input.orderId,
        p_station: input.station,
        p_idempotency_key: printIdempotencyKey({
          orderId: input.orderId,
          station: input.station,
          status: input.status,
          reprintSeq: input.reprintSeq,
        }),
        p_copies: normalizeCopies(input.copies),
        p_printer_name: input.printerName ?? null,
        p_is_reprint: input.isReprint ?? false,
        p_reason: input.reason ?? null,
        p_reprint_of: input.reprintOf ?? null,
      });
      if (error) throw error;
      return data as unknown as RpcResult & { job_id?: string; copies?: number };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: [PRINT_KEY] });
      if (!result?.success) toast.error(result?.message ?? "Não foi possível enfileirar a comanda.");
    },
    onError: (error: Error) => toast.error(error.message || "Falha ao enfileirar a comanda."),
  });
}

/** Atualiza a situação do trabalho (impresso, falhou, cancelado). */
export function useUpdatePrintJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      jobId: string;
      status: PrintJobStatus;
      error?: string | null;
      printerName?: string | null;
    }) => {
      const { data, error } = await supabase.rpc("ped_update_print_job", {
        p_job_id: input.jobId,
        p_status: input.status,
        p_error: input.error ?? null,
        p_printer_name: input.printerName ?? null,
      });
      if (error) throw error;
      return data as unknown as RpcResult;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [PRINT_KEY] }),
    onError: (error: Error) => toast.error(error.message || "Falha ao atualizar a fila."),
  });
}

/** Preferências de impressão da sessão (nunca persistem dados sensíveis). */
export function usePrintPreferences(defaults?: { copies?: number; autoPrint?: boolean }) {
  const [copies, setCopies] = useState(() => normalizeCopies(defaults?.copies ?? 1));
  const [autoPrint, setAutoPrint] = useState(!!defaults?.autoPrint);
  const [printerName, setPrinterName] = useState<string>("");

  const reset = useCallback(() => {
    setCopies(normalizeCopies(defaults?.copies ?? 1));
    setAutoPrint(!!defaults?.autoPrint);
    setPrinterName("");
  }, [defaults?.copies, defaults?.autoPrint]);

  return useMemo(
    () => ({
      copies,
      setCopies: (value: number) => setCopies(normalizeCopies(value)),
      autoPrint,
      setAutoPrint,
      printerName,
      setPrinterName,
      reset,
    }),
    [copies, autoPrint, printerName, reset],
  );
}
