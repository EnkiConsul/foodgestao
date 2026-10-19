import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Contagem por data, pela mesma configuração vigente usada na trava do banco. */
export function useFixosPorDiaSemana(companyId: string | null | undefined, unidadeId: string | null, inicio: string | undefined, fim = inicio) {
  const query = useQuery({
    queryKey: ["dp_colab_config_trabalho", "fixos_periodo", companyId, unidadeId, inicio, fim],
    enabled: !!companyId && !!unidadeId && !!inicio && !!fim,
    queryFn: async () => {
      if (!companyId || !unidadeId || !inicio || !fim) return new Map<string, Map<number, number>>();
      const result = await supabase.rpc("dp_folga_fixos_periodo", { p_company: companyId, p_unidade: unidadeId, p_inicio: inicio, p_fim: fim });
      if (result.error) throw new Error(result.error.message);
      return new Map((result.data ?? []).map((r) => [r.data, new Map([[r.dow, r.quantidade]])]));
    },
  });
  return { ...query, naData: (iso: string) => query.data?.get(iso) };
}
