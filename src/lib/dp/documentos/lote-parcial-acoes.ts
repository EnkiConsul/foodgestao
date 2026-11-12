import { supabase } from "@/integrations/supabase/client";
import { statusLoteAposDecisao, type PaginaLote, type StatusLote } from "./lote-parcial";

/**
 * Recalcula a situação do lote a partir das páginas gravadas, com a mesma
 * regra do servidor ao aprovar. Ignorar a última pendência conclui o lote;
 * desfazer uma página ignorada reabre a conferência.
 */
export async function recalcularStatusLote(batchId: string): Promise<{ status: StatusLote; paginas: PaginaLote[] }> {
  const { data, error } = await supabase
    .from("dp_bulk_import_items" as never)
    .select("id,status,matched_colaborador_id")
    .eq("batch_id", batchId);
  if (error) throw error;
  const paginas = (data ?? []) as unknown as PaginaLote[];
  const status = statusLoteAposDecisao(paginas);
  const { data: lote, error: e1 } = await supabase
    .from("dp_bulk_import_batches" as never)
    .select("status")
    .eq("id", batchId)
    .maybeSingle();
  if (e1) throw e1;
  const atual = (lote as { status?: string } | null)?.status;
  // Leitura em andamento ou falha geral não são decididas pela conferência.
  if (atual && ["ready", "partially_imported", "imported"].includes(atual) && atual !== status) {
    const { error: e2 } = await supabase
      .from("dp_bulk_import_batches" as never)
      .update({ status } as never)
      .eq("id", batchId);
    if (e2) throw e2;
  }
  return { status, paginas };
}

/** Marca páginas como ignoradas e atualiza a situação do lote. */
export async function ignorarPaginasLote(batchId: string, ids: readonly string[]) {
  if (ids.length > 0) {
    const { error } = await supabase
      .from("dp_bulk_import_items" as never)
      .update({ status: "rejected", decided_at: new Date().toISOString() } as never)
      .eq("batch_id", batchId)
      .in("id", ids as string[])
      .neq("status", "imported");
    if (error) throw error;
  }
  return recalcularStatusLote(batchId);
}

/** Devolve uma página ignorada para a conferência. */
export async function reabrirPaginaLote(batchId: string, id: string) {
  const { error } = await supabase
    .from("dp_bulk_import_items" as never)
    .update({ status: "pending", decided_at: null } as never)
    .eq("batch_id", batchId)
    .eq("id", id)
    .eq("status", "rejected");
  if (error) throw error;
  return recalcularStatusLote(batchId);
}
