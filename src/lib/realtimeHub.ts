/**
 * Hub único de Realtime.
 *
 * Problema que resolve: cada hook/página criava seu próprio canal Supabase.
 * Com muitas telas abertas (e muitos clientes), isso multiplica conexões e
 * mensagens sem necessidade.
 *
 * Aqui mantemos **um canal por (escopo, tabela)**, compartilhado por todos os
 * assinantes via contagem de referências. O canal só é removido quando o
 * último assinante sai.
 */
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";

export type RealtimeEvent = "INSERT" | "UPDATE" | "DELETE";
export type RealtimeListener = (table: string, event: RealtimeEvent) => void;

interface Entry {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  channel: any;
  listeners: Set<RealtimeListener>;
}

const registry = new Map<string, Entry>();

/**
 * Assina uma tabela dentro de um escopo (filtro de tenant).
 * Retorna a função de cancelamento.
 */
export function subscribeRealtime(
  table: string,
  filter: string,
  listener: RealtimeListener
): () => void {
  const key = `${table}::${filter}`;
  let entry = registry.get(key);

  if (!entry) {
    const channel = supabase.channel(`hub:${key}`);
    entry = { channel, listeners: new Set() };
    registry.set(key, entry);

    channel.on(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      "postgres_changes" as any,
      { event: "*", schema: "public", table, filter },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (payload: any) => {
        const event = (payload.eventType ?? payload.type) as RealtimeEvent;
        registry.get(key)?.listeners.forEach((fn) => {
          try {
            fn(table, event);
          } catch (error) {
            logger.error("Listener de realtime falhou", error, { scope: "realtime", table });
          }
        });
      }
    );

    channel.subscribe();
  }

  entry.listeners.add(listener);

  return () => {
    const current = registry.get(key);
    if (!current) return;
    current.listeners.delete(listener);
    if (current.listeners.size === 0) {
      registry.delete(key);
      supabase.removeChannel(current.channel);
    }
  };
}

/** Diagnóstico: quantos canais estão abertos agora. */
export function realtimeHubStats() {
  return {
    channels: registry.size,
    listeners: Array.from(registry.values()).reduce((acc, e) => acc + e.listeners.size, 0),
  };
}
