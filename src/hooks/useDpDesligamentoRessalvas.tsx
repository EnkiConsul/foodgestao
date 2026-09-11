import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Ressalvas do desligamento (observação interna + "recontrataria?").
 *
 * Ficam em `dp_colaborador_desligamento_restrito`, tabela que só donos,
 * administradores/RH e super admin conseguem ler. O colaborador NÃO tem
 * política de leitura nessa tabela — por isso as ressalvas nunca chegam
 * ao portal dele, nem mesmo na resposta da API.
 *
 * Cada desligamento tem o seu registro: recontratar apenas encerra o ciclo
 * (`encerrado_em`), nunca apaga. O histórico fica disponível para o RH.
 */
export type DpDesligamentoRessalva = {
  id: string;
  observacao: string | null;
  elegivel_recontratacao: string | null;
  data_desligamento: string | null;
  encerrado_em: string | null;
  created_at: string;
};

export function useDpDesligamentoRessalvas(colaboradorId: string | null | undefined) {
  const query = useQuery({
    queryKey: ["dp_desligamento_ressalvas", colaboradorId],
    enabled: !!colaboradorId,
    queryFn: async (): Promise<DpDesligamentoRessalva[]> => {
      const { data, error } = await supabase
        .from("dp_colaborador_desligamento_restrito")
        .select("id, observacao, elegivel_recontratacao, data_desligamento, encerrado_em, created_at")
        .eq("colaborador_id", colaboradorId!)
        .order("created_at", { ascending: false });
      // Sem permissão (colaborador) ou sem registro: trata como vazio.
      if (error) return [];
      return (data as DpDesligamentoRessalva[] | null) ?? [];
    },
  });

  const registros = query.data ?? [];
  /** Ciclo em aberto: é o que o RH edita hoje. */
  const atual = registros.find((r) => !r.encerrado_em) ?? null;
  /** Desligamentos anteriores — somente leitura. */
  const historico = registros.filter((r) => !!r.encerrado_em);

  return { ...query, registros, atual, historico };
}

export function useSalvarDpDesligamentoRessalvas() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      colaborador_id: string;
      observacao?: string | null;
      elegibilidade?: string | null;
    }) => {
      const { error } = await supabase.rpc("dp_set_desligamento_ressalvas", {
        p_colaborador_id: input.colaborador_id,
        p_observacao: input.observacao ?? undefined,
        p_elegibilidade: (input.elegibilidade ?? null) as any,
      });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["dp_desligamento_ressalvas", vars.colaborador_id] });
    },
  });
}
