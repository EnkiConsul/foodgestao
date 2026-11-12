import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { DIAS_LOTE_ABERTO, lotesAbertos, type LoteDocumento } from "@/lib/dp/documentos/lotes-abertos";

export interface LoteDocumentoAberto extends LoteDocumento {
  source_file_name: string | null;
  referencia_data: string | null;
  deteccao_automatica: boolean | null;
  pendentes: number;
}

/**
 * Lotes de documentos em leitura ou com páginas a conferir. A chave
 * "dp_bulk_pending_counts" já é atualizada por envio, aprovação, recusa,
 * descarte e reprocessamento.
 */
export function useDpLotesDocumentoAbertos(enabled = true) {
  const { selectedCompanyId } = useCompanyContext();
  return useQuery({
    queryKey: ["dp_bulk_pending_counts", selectedCompanyId],
    enabled: enabled && !!selectedCompanyId,
    refetchInterval: (q) => {
      const rows = (q.state.data ?? []) as LoteDocumentoAberto[];
      return rows.some((l) => l.status === "processing" || l.status === "queued") ? 3000 : false;
    },
    queryFn: async (): Promise<LoteDocumentoAberto[]> => {
      const desde = new Date(Date.now() - DIAS_LOTE_ABERTO * 86_400_000).toISOString();
      const { data: lotes, error } = await supabase
        .from("dp_bulk_import_batches" as never)
        .select("id, status, tipo, created_at, total_pages, processed_pages, source_file_name, referencia_data, deteccao_automatica")
        .eq("company_id", selectedCompanyId!)
        .in("status", ["queued", "processing", "ready", "partially_imported"])
        .gte("created_at", desde)
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      const rows = (lotes ?? []) as unknown as Omit<LoteDocumentoAberto, "pendentes">[];
      if (rows.length === 0) return [];
      const { data: paginas, error: e2 } = await supabase
        .from("dp_bulk_import_items" as never)
        .select("batch_id")
        .in("batch_id", rows.map((r) => r.id))
        .eq("status", "pending")
        .limit(5000);
      if (e2) throw e2;
      const pend: Record<string, number> = {};
      for (const p of (paginas ?? []) as unknown as Array<{ batch_id: string }>) pend[p.batch_id] = (pend[p.batch_id] ?? 0) + 1;
      return lotesAbertos(rows, pend).map((l) => ({ ...l, pendentes: pend[l.id] ?? 0 }));
    },
  });
}
