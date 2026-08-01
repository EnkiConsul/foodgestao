import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface SystemHealth {
  generated_at: string;
  database: {
    size_bytes: number;
    commits: number;
    rollbacks: number;
    rollback_ratio: number;
    cache_hit_ratio: number;
    deadlocks: number;
    connections: number;
  };
  tables: Array<{
    name: string;
    live_rows: number | null;
    dead_rows: number | null;
    total_bytes: number;
    seq_scan: number | null;
    idx_scan: number | null;
  }>;
  unused_indexes: Array<{ index: string; table: string; size_bytes: number }>;
  volumes: {
    usuarios: number;
    empresas: number;
    lancamentos: number;
    colaboradores: number;
    assinaturas_ativas: number;
  };
  integracoes: {
    pluggy_conexoes: number;
    pluggy_erros: number;
    pluggy_webhooks_pendentes: number;
    pluggy_webhooks_dead_letter: number;
    asaas_webhooks_24h: number;
  };
}

export function useSystemHealth() {
  return useQuery({
    queryKey: ["system-health"],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("system_health_snapshot");
      if (error) throw error;
      return data as SystemHealth;
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

export function formatBytes(bytes: number) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, i)).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} ${units[i]}`;
}
