import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Ressalvas do desligamento (observação interna + "recontrataria?").
 *
 * Ficam em `dp_colaborador_desligamento_restrito`, tabela que só donos,
 * administradores/RH e super admin conseguem ler. O colaborador NÃO tem
 * política de leitura nessa tabela — por isso as ressalvas nunca chegam
 * ao portal dele, nem mesmo na resposta da API.
 */
export type DpDesligamentoRessalvas = {
  observacao: string | null;
  elegivel_recontratacao: string | null;
};

export function useDpDesligamentoRessalvas(colaboradorId: string | null | undefined) {
  return useQuery({
    queryKey: ["dp_desligamento_ressalvas", colaboradorId],
    enabled: !!colaboradorId,
    queryFn: async (): Promise<DpDesligamentoRessalvas | null> => {
      const { data, error } = await supabase
        .from("dp_colaborador_desligamento_restrito")
        .select("observacao, elegivel_recontratacao")
        .eq("colaborador_id", colaboradorId!)
        .maybeSingle();
      // Sem permissão (colaborador) ou sem registro: trata como vazio.
      if (error) return null;
      return (data as DpDesligamentoRessalvas | null) ?? null;
    },
  });
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
