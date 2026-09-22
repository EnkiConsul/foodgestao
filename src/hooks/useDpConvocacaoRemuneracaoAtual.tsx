import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { snapshotDesatualizado } from "@/lib/dp/convocacao-remuneracao";

interface Linha {
  convocacao_id: string;
  snapshot: any;
}

/**
 * Recalcula no servidor o resumo de valores das convocações cujo resumo
 * gravado é de versão anterior (sem vale-alimentação, prêmio e DSR).
 * Somente leitura: o resumo histórico nunca é reescrito.
 */
export function useConvocacaoRemuneracaoAtual(
  convocacoes: { id: string; status: string; remuneracao_snapshot: unknown }[],
) {
  const ids = useMemo(
    () =>
      convocacoes
        .filter(
          (c) =>
            (c.status === "pendente" || c.status === "aceita") &&
            snapshotDesatualizado(c.remuneracao_snapshot),
        )
        .map((c) => c.id)
        .sort(),
    [convocacoes],
  );

  const query = useQuery({
    queryKey: ["dp_convocacoes_remuneracao_atual", ids],
    enabled: ids.length > 0,
    queryFn: async (): Promise<Record<string, any>> => {
      const { data, error } = await (supabase.rpc as any)("dp_convocacoes_remuneracao_atual", {
        p_ids: ids,
      });
      if (error) throw error;
      const mapa: Record<string, any> = {};
      for (const l of (data ?? []) as Linha[]) mapa[l.convocacao_id] = l.snapshot;
      return mapa;
    },
  });

  return query.data ?? {};
}
