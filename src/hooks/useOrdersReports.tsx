import { useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { toast } from "@/hooks/use-toast";

export interface OrdersReportTotals {
  orders: number;
  orders_completed: number;
  orders_cancelled: number;
  cancel_rate: number;
  gross_sales: number;
  discounts: number;
  delivery_fees: number;
  service_fees: number;
  total_amount: number;
  estimated_net: number;
  avg_ticket: number;
  avg_accept_seconds: number;
  avg_prep_seconds: number;
  avg_total_seconds: number;
  p95_total_seconds: number;
  test_orders: number;
  late_orders?: number;
  late_rate?: number;
  refunds?: number;
  refunded_payments?: number;
}

export interface OrdersReportOverview {
  success: boolean;
  range: { from: string; to: string; include_test: boolean; unit_id: string | null };
  totals: OrdersReportTotals;
  by_unit: { unit_id: string; unit_name: string; orders: number; revenue: number }[];
  by_channel: { channel: string; orders: number; revenue: number }[];
  by_type: { order_type: string; order_timing: string; orders: number; revenue: number }[];
  by_day: { day: string; orders: number; revenue: number }[];
  peak_hours: { hour: number; orders: number; revenue: number }[];
  top_products: {
    product: string;
    quantity: number;
    revenue: number;
    avg_prep_seconds: number;
  }[];
  delivery: {
    deliveries: number;
    delivered: number;
    failed: number;
    avg_pickup_seconds: number;
    avg_transit_seconds: number;
    avg_distance_meters: number;
    fees: number;
  };
  generated_at: string;
}

export interface OrdersOpsHealth {
  success: boolean;
  queue: Record<string, unknown>;
  print: { total: number; queued: number; failed: number; printed: number };
  dead_letters: { open_dead_letters: number; last_7d: number };
  orders: {
    open_orders: number;
    awaiting_accept: number;
    stuck_over_2h: number;
    last_order_at: string | null;
  };
  generated_at: string;
}

export type OrdersExportDataset =
  | "orders"
  | "items"
  | "payments"
  | "cancellations"
  | "customers";

export interface OrdersReportFilters {
  from: string;
  to: string;
  unitId: string | null;
  includeTest: boolean;
}

function useCompanyScope() {
  const { user } = useAuth();
  const { contextType, selectedCompanyId } = useCompanyContext();
  return {
    companyId: selectedCompanyId,
    enabled: !!user && contextType === "pj" && !!selectedCompanyId,
  };
}

/** Indicadores operacionais consolidados do módulo Pedidos. */
export function useOrdersReportOverview(filters: OrdersReportFilters) {
  const { companyId, enabled } = useCompanyScope();

  return useQuery({
    queryKey: ["orders-report-overview", companyId, filters],
    enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<OrdersReportOverview> => {
      const { data, error } = await supabase.rpc("ped_reports_overview", {
        p_company_id: companyId!,
        p_from: new Date(`${filters.from}T00:00:00`).toISOString(),
        p_to: new Date(`${filters.to}T23:59:59`).toISOString(),
        p_unit_id: filters.unitId,
        p_include_test: filters.includeTest,
      });
      if (error) throw error;
      return data as unknown as OrdersReportOverview;
    },
  });
}

/** Painel técnico: filas, dead letters, impressão e pedidos travados. */
export function useOrdersOpsHealth() {
  const { companyId, enabled } = useCompanyScope();

  return useQuery({
    queryKey: ["orders-ops-health", companyId],
    enabled,
    staleTime: 20_000,
    refetchInterval: 60_000,
    queryFn: async (): Promise<OrdersOpsHealth> => {
      const { data, error } = await supabase.rpc("ped_ops_health", {
        p_company_id: companyId!,
      });
      if (error) throw error;
      return data as unknown as OrdersOpsHealth;
    },
  });
}

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const escape = (value: unknown) => {
    if (value === null || value === undefined) return "";
    const text = String(value).replace(/"/g, '""');
    return /[";\n]/.test(text) ? `"${text}"` : text;
  };
  return [
    headers.join(";"),
    ...rows.map((row) => headers.map((h) => escape(row[h])).join(";")),
  ].join("\n");
}

/** Exportação segura (mascarada conforme permissão) em CSV. */
export function useOrdersExport(filters: OrdersReportFilters) {
  const { companyId } = useCompanyScope();

  return useMutation({
    mutationFn: async (dataset: OrdersExportDataset) => {
      if (!companyId) throw new Error("Selecione uma empresa.");
      const { data, error } = await supabase.rpc("ped_export_dataset", {
        p_company_id: companyId,
        p_dataset: dataset,
        p_from: new Date(`${filters.from}T00:00:00`).toISOString(),
        p_to: new Date(`${filters.to}T23:59:59`).toISOString(),
        p_unit_id: filters.unitId,
        p_include_test: filters.includeTest,
        p_limit: 20000,
      });
      if (error) throw error;
      const payload = data as unknown as {
        rows: Record<string, unknown>[];
        masked: boolean;
        count: number;
      };
      const csv = toCsv(payload.rows ?? []);
      const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `pedidos-${dataset}-${filters.from}-a-${filters.to}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      return payload;
    },
    onSuccess: (payload) => {
      toast({
        title: "Exportação concluída",
        description: `${payload.count} registros exportados${
          payload.masked ? " (dados pessoais mascarados)" : ""
        }.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Não foi possível exportar",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}
