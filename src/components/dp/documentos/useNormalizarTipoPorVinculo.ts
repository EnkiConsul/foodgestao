import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { tipoCanonicoPorVinculo } from "@/lib/dp/documento-tipo-por-vinculo";

/**
 * Páginas vinculadas antes da regra de vínculo ficaram com a natureza da leitura
 * (ex.: "contracheque" para um sócio com pró-labore). Ao abrir a conferência,
 * normaliza essas páginas uma única vez cada.
 *
 * Não toca em páginas já corrigidas à mão (tipo_origem = "manual").
 */
export function useNormalizarTipoPorVinculo(params: {
  batchId: string;
  rows: any[];
  colaboradores: any[];
  batchTipo?: string | null;
}) {
  const { batchId, rows, colaboradores, batchTipo } = params;
  const qc = useQueryClient();
  const feitosRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!batchId || !rows.length || !colaboradores.length) return;

    const pendentes = rows.filter((r: any) => {
      if (feitosRef.current.has(r.id)) return false;
      if (r.status !== "pending" || !r.matched_colaborador_id) return false;
      if (r.tipo_origem === "manual") return false;
      const colab = colaboradores.find((c: any) => c.id === r.matched_colaborador_id);
      if (!colab) return false;
      const tipoAtual = r.tipo_detectado ?? batchTipo;
      if (!tipoAtual) return false;
      const tipoNovo = tipoCanonicoPorVinculo(tipoAtual, colab);
      return tipoNovo !== r.tipo_detectado;
    });
    if (!pendentes.length) return;

    let cancelado = false;
    void (async () => {
      for (const r of pendentes) {
        feitosRef.current.add(r.id);
        const colab = colaboradores.find((c: any) => c.id === r.matched_colaborador_id);
        const tipoNovo = tipoCanonicoPorVinculo(r.tipo_detectado ?? batchTipo!, colab);
        await supabase
          .from("dp_bulk_import_items" as any)
          .update({ tipo_detectado: tipoNovo, tipo_origem: "vinculo", tipo_confidence: 1 })
          .eq("id", r.id);
      }
      if (!cancelado) qc.invalidateQueries({ queryKey: ["dp_bulk_items_review", batchId] });
    })();
    return () => { cancelado = true; };
  }, [batchId, rows, colaboradores, batchTipo, qc]);
}
