import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompanyContext } from "@/hooks/useCompanyContext";

export interface OrdersQueueMetrics {
  inbox: {
    pending: number;
    processing: number;
    done: number;
    ignored: number;
    dead: number;
    total: number;
  };
  outbox: { pending: number; processing: number; done: number; dead: number; total: number };
  dead_letters_open: number;
  oldest_pending_seconds: number;
  generated_at: string;
}

export interface OrdersIntegrationRow {
  id: string;
  provider: string;
  status: string;
  display_name: string;
  unit_id: string | null;
  approved_at: string | null;
  last_event_at: string | null;
  created_at: string;
}


export interface OrdersInboxRow {
  id: string;
  provider: string;
  event_type: string;
  external_event_id: string;
  external_order_id: string | null;
  status: string;
  attempts: number;
  max_attempts: number;
  received_at: string;
  processed_at: string | null;
  next_attempt_at: string;
  error_class: string | null;
  error_message: string | null;
  order_id: string | null;
}

export interface OrdersOutboxRow {
  id: string;
  provider: string;
  operation: string;
  status: string;
  attempts: number;
  max_attempts: number;
  created_at: string;
  sent_at: string | null;
  next_attempt_at: string;
  error_class: string | null;
  error_message: string | null;
  order_id: string | null;
}

export interface OrdersDeadLetterRow {
  id: string;
  provider: string;
  source: string;
  event_type: string | null;
  attempts: number;
  error_class: string | null;
  error_message: string | null;
  created_at: string;
  replayed_at: string | null;
}

function useCompanyScope() {
  const { user } = useAuth();
  const { contextType, selectedCompanyId } = useCompanyContext();
  return {
    companyId: selectedCompanyId,
    enabled: !!user && contextType === "pj" && !!selectedCompanyId,
  };
}

/** Métricas agregadas de fila (inbox, outbox, dead letters e lag). */
export function useOrdersQueueMetrics() {
  const { companyId, enabled } = useCompanyScope();

  return useQuery({
    queryKey: ["orders-queue-metrics", companyId],
    enabled,
    staleTime: 15_000,
    refetchInterval: 30_000,
    queryFn: async (): Promise<OrdersQueueMetrics> => {
      const { data, error } = await supabase.rpc("ped_integration_metrics", {
        p_company_id: companyId!,
      });
      if (error) throw error;
      return data as unknown as OrdersQueueMetrics;
    },
  });
}

/** Canais externos cadastrados para a empresa selecionada. */
export function useOrdersIntegrations() {
  const { companyId, enabled } = useCompanyScope();

  return useQuery({
    queryKey: ["orders-integrations", companyId],
    enabled,
    staleTime: 30_000,
    queryFn: async (): Promise<OrdersIntegrationRow[]> => {
      const { data, error } = await supabase
        .from("ped_order_integrations")
        .select(
          "id, provider, status, display_name, unit_id, approved_at, last_event_at, created_at",
        )

        .eq("company_id", companyId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as OrdersIntegrationRow[];
    },
  });
}

/** Últimos eventos recebidos dos canais externos. */
export function useOrdersInbox(limit = 30) {
  const { companyId, enabled } = useCompanyScope();

  return useQuery({
    queryKey: ["orders-inbox", companyId, limit],
    enabled,
    staleTime: 15_000,
    refetchInterval: 30_000,
    queryFn: async (): Promise<OrdersInboxRow[]> => {
      const { data, error } = await supabase
        .from("ped_event_inbox")
        .select(
          "id, provider, event_type, external_event_id, external_order_id, status, attempts, max_attempts, received_at, processed_at, next_attempt_at, error_class, error_message, order_id",
        )
        .eq("company_id", companyId!)
        .order("received_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as OrdersInboxRow[];
    },
  });
}

/** Mensagens pendentes/enviadas para os canais externos. */
export function useOrdersOutbox(limit = 30) {
  const { companyId, enabled } = useCompanyScope();

  return useQuery({
    queryKey: ["orders-outbox", companyId, limit],
    enabled,
    staleTime: 15_000,
    refetchInterval: 30_000,
    queryFn: async (): Promise<OrdersOutboxRow[]> => {
      const { data, error } = await supabase
        .from("ped_outbox")
        .select(
          "id, provider, operation, status, attempts, max_attempts, created_at, sent_at, next_attempt_at, error_class, error_message, order_id",
        )
        .eq("company_id", companyId!)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as OrdersOutboxRow[];
    },
  });
}

/** Eventos que esgotaram as tentativas e aguardam análise. */
export function useOrdersDeadLetters(limit = 30) {
  const { companyId, enabled } = useCompanyScope();

  return useQuery({
    queryKey: ["orders-dead-letters", companyId, limit],
    enabled,
    staleTime: 15_000,
    refetchInterval: 60_000,
    queryFn: async (): Promise<OrdersDeadLetterRow[]> => {
      const { data, error } = await supabase
        .from("ped_dead_letters")
        .select(
          "id, provider, source, event_type, attempts, error_class, error_message, created_at, replayed_at",
        )
        .eq("company_id", companyId!)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as OrdersDeadLetterRow[];
    },
  });
}
