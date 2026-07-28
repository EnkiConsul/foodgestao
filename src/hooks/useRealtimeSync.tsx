import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompanyContext } from "@/hooks/useCompanyContext";

type RealtimeTable = "transactions" | "accounts" | "categories" | "contacts" | "payment_methods" | "category_companies" | "contact_companies" | "bank_connections" | "bank_connection_accounts" | "chart_accounts" | "chart_account_companies" | "credit_cards" | "credit_card_invoices";

interface Options {
  /** Tabelas a monitorar */
  tables: RealtimeTable[];
  /**
   * Prefixos de queryKey a invalidar no React Query.
   * Ex: ["dashboard-", "fluxo-caixa-"] invalida toda key cujo primeiro elemento começa com isso.
   */
  invalidateKeyPrefixes?: string[];
  /** Callback alternativo (ou complementar) — útil para páginas sem React Query. */
  onChange?: (table: RealtimeTable, eventType: "INSERT" | "UPDATE" | "DELETE") => void;
  /** Debounce em ms (default 400) para agrupar rajadas de eventos. */
  debounceMs?: number;
  /** Desabilita a subscription. */
  enabled?: boolean;
}

/**
 * Hook genérico de sincronização em tempo real.
 *
 * Em PJ: assina eventos da empresa ativa (filtro company_id).
 * Em PF: assina eventos do usuário (filtro user_id).
 *
 * Reconecta automaticamente quando o contexto/empresa muda.
 */
export function useRealtimeSync({
  tables,
  invalidateKeyPrefixes,
  onChange,
  debounceMs = 400,
  enabled = true,
}: Options) {
  const { user } = useAuth();
  const { contextType, selectedCompanyId } = useCompanyContext();
  const queryClient = useQueryClient();
  const debounceRef = useRef<Map<RealtimeTable, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    if (!enabled || !user) return;
    if (contextType === "pj" && !selectedCompanyId) return;

    const filter =
      contextType === "pj"
        ? `company_id=eq.${selectedCompanyId}`
        : `user_id=eq.${user.id}`;

    const channelName = `sync-${contextType}-${selectedCompanyId ?? user.id}-${tables.join("-")}`;
    const channel = supabase.channel(channelName);

    tables.forEach((table) => {
      channel.on(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        "postgres_changes" as any,
        { event: "*", schema: "public", table, filter },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (payload: any) => {
          const eventType = payload.eventType as "INSERT" | "UPDATE" | "DELETE";

          // Debounce por tabela
          const existing = debounceRef.current.get(table);
          if (existing) clearTimeout(existing);
          const t = setTimeout(() => {
            if (invalidateKeyPrefixes?.length) {
              queryClient.invalidateQueries({
                predicate: (q) => {
                  const first = q.queryKey[0];
                  return typeof first === "string" && invalidateKeyPrefixes.some((p) => first.startsWith(p));
                },
              });
            }
            onChange?.(table, eventType);
            debounceRef.current.delete(table);
          }, debounceMs);
          debounceRef.current.set(table, t);
        }
      );
    });

    channel.subscribe();

    return () => {
      debounceRef.current.forEach((t) => clearTimeout(t));
      debounceRef.current.clear();
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, user?.id, contextType, selectedCompanyId, tables.join("|"), invalidateKeyPrefixes?.join("|")]);
}
