import { supabase } from "@/integrations/supabase/client";

/** Páginas por chamada: mantém cada envio bem abaixo do tempo limite da rede. */
export const BULK_APPROVE_CHUNK = 8;

export type BulkApproveResult = { id?: string; ok: boolean; error?: string; replaced?: boolean; documento_id?: string };

/**
 * Aprova páginas em blocos sequenciais. Se um bloco falhar, os anteriores já
 * ficaram gravados; o erro informa quantas páginas foram concluídas.
 */
export async function aprovarEmBlocos(
  item_ids: string[],
  extra: Record<string, unknown> = {},
): Promise<{ results: BulkApproveResult[] }> {
  const results: BulkApproveResult[] = [];
  for (let i = 0; i < item_ids.length; i += BULK_APPROVE_CHUNK) {
    const bloco = item_ids.slice(i, i + BULK_APPROVE_CHUNK);
    const { data, error } = await supabase.functions.invoke("dp-doc-bulk-approve", {
      body: { ...extra, item_ids: bloco, progresso_base: i },
    });
    if (error) {
      // O SDK só diz "non-2xx"; o motivo real está no corpo da resposta.
      let motivo: string | null = null;
      try {
        const body = await (error as any)?.context?.json?.();
        if (typeof body?.error === "string" && body.error.trim()) motivo = body.error.trim();
      } catch { /* corpo ilegível */ }
      const base = i > 0
        ? `${i} de ${item_ids.length} páginas foram salvas antes da falha. Tente aprovar novamente as restantes.`
        : "Não foi possível aprovar as páginas. Tente novamente.";
      const err = new Error(motivo ? `${base} Motivo: ${motivo}` : base);
      (err as any).cause = error;
      (err as any).details = { status: (error as any)?.context?.status ?? null, motivo, salvas: i, total: item_ids.length };
      throw err;
    }
    results.push(...(((data as any)?.results ?? []) as BulkApproveResult[]));
  }
  return { results };
}
