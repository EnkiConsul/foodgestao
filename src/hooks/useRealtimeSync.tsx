import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { subscribeRealtime } from "@/lib/realtimeHub";

type RealtimeTable = "transactions" | "accounts" | "categories" | "contacts" | "payment_methods" | "category_companies" | "contact_companies" | "bank_connections" | "bank_connection_accounts" | "chart_accounts" | "chart_account_companies" | "credit_cards" | "credit_card_invoices" | "cost_centers" | "cost_center_companies";

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
 * Os canais são compartilhados pelo hub (`src/lib/realtimeHub.ts`): várias
 * telas assinando a mesma tabela/escopo usam uma única conexão.
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
  const debounceRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Callback sempre atualizado sem recriar a subscription.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!enabled || !user) return;
    if (contextType === "pj" && !selectedCompanyId) return;

    const filter =
      contextType === "pj"
        ? `company_id=eq.${selectedCompanyId}`
        : `user_id=eq.${user.id}`;

    const timers = debounceRef.current;

    const unsubscribers = tables.map((table) =>
      subscribeRealtime(table, filter, (_t, eventType) => {
        // Debounce por tabela
        const existing = timers.get(table);
        if (existing) clearTimeout(existing);
        const t = setTimeout(() => {
          if (invalidateKeyPrefixes?.length) {
            queryClient.invalidateQueries({
              predicate: (q) => {
                const first = q.queryKey[0];
                return (
                  typeof first === "string" &&
                  invalidateKeyPrefixes.some((p) => first.startsWith(p))
                );
              },
            });
          }
          onChangeRef.current?.(table, eventType);
          timers.delete(table);
        }, debounceMs);
        timers.set(table, t);
      })
    );

    return () => {
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
      unsubscribers.forEach((fn) => fn());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, user?.id, contextType, selectedCompanyId, tables.join("|"), invalidateKeyPrefixes?.join("|")]);
}
