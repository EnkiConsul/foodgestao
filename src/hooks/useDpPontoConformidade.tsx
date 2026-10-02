import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { conformidadePonto, type PontoConformidade } from "@/lib/dp/ponto-conformidade";

export interface UnidadeConformidade {
  id: string;
  nome: string;
  ativos: number;
  situacao: PontoConformidade;
  justificativa: string | null;
}

/** Situação do ponto (Art. 74 CLT) de cada unidade ativa da empresa selecionada. */
export function useDpPontoConformidade() {
  const { selectedCompanyId } = useCompanyContext();
  return useQuery({
    queryKey: ["dp_ponto_conformidade", selectedCompanyId],
    enabled: !!selectedCompanyId,
    staleTime: 60_000,
    queryFn: async (): Promise<UnidadeConformidade[]> => {
      const { data: unidades, error } = await supabase
        .from("dp_unidades")
        .select("id, nome, possui_relogio_ponto, relogio_ponto_dispensa_justificativa")
        .eq("company_id", selectedCompanyId!)
        .eq("ativo", true);
      if (error) throw error;
      const ids = (unidades ?? []).map((u) => u.id);
      if (!ids.length) return [];
      const { data: colabs } = await supabase
        .from("dp_colaboradores")
        .select("unidade_id")
        .in("unidade_id", ids)
        .eq("ativo", true)
        .is("deleted_at", null)
        .is("data_desligamento", null);
      const cont = new Map<string, number>();
      (colabs ?? []).forEach((c) => c.unidade_id && cont.set(c.unidade_id, (cont.get(c.unidade_id) ?? 0) + 1));
      return (unidades ?? []).map((u) => {
        const ativos = cont.get(u.id) ?? 0;
        return {
          id: u.id,
          nome: u.nome,
          ativos,
          situacao: conformidadePonto(u, ativos),
          justificativa: u.relogio_ponto_dispensa_justificativa ?? null,
        };
      });
    },
  });
}
