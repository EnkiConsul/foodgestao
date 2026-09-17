/**
 * Vínculo de um documento obrigatório com cargos e unidades da empresa.
 *
 * Sem esta configuração as regras por cargo/unidade não seriam utilizáveis:
 * a exigência vale para todos ou para ninguém. Os vínculos usam sempre os
 * cadastros canônicos (Cargos e Unidades), nunca comparação por nome.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";

export interface EscopoRequisito {
  cargos: string[];
  unidades: string[];
}

export function useDpRequisitoEscopo(requisitoId: string | null) {
  const { currentCompanyId } = useCompany();
  const qc = useQueryClient();
  const chave = ["dp-requisito-escopo", requisitoId, currentCompanyId];

  const escopo = useQuery({
    queryKey: chave,
    enabled: !!requisitoId && !!currentCompanyId,
    queryFn: async (): Promise<EscopoRequisito> => {
      const [c, u] = await Promise.all([
        supabase.from("dp_requisito_cargos").select("cargo_id").eq("requisito_id", requisitoId!),
        supabase.from("dp_requisito_unidades").select("unidade_id").eq("requisito_id", requisitoId!),
      ]);
      if (c.error) throw c.error;
      if (u.error) throw u.error;
      return {
        cargos: (c.data ?? []).map((r) => r.cargo_id),
        unidades: (u.data ?? []).map((r) => r.unidade_id),
      };
    },
  });

  /** Substitui o conjunto de vínculos: remove o que saiu e grava o que entrou. */
  const salvar = useMutation({
    mutationFn: async (novo: EscopoRequisito) => {
      if (!requisitoId || !currentCompanyId) throw new Error("Selecione uma empresa antes de salvar.");
      const atual = escopo.data ?? { cargos: [], unidades: [] };
      const remCargos = atual.cargos.filter((id) => !novo.cargos.includes(id));
      const remUnidades = atual.unidades.filter((id) => !novo.unidades.includes(id));
      const addCargos = novo.cargos.filter((id) => !atual.cargos.includes(id));
      const addUnidades = novo.unidades.filter((id) => !atual.unidades.includes(id));

      if (remCargos.length) {
        const { error } = await supabase.from("dp_requisito_cargos").delete()
          .eq("requisito_id", requisitoId).in("cargo_id", remCargos);
        if (error) throw error;
      }
      if (remUnidades.length) {
        const { error } = await supabase.from("dp_requisito_unidades").delete()
          .eq("requisito_id", requisitoId).in("unidade_id", remUnidades);
        if (error) throw error;
      }
      if (addCargos.length) {
        const { error } = await supabase.from("dp_requisito_cargos").insert(
          addCargos.map((cargo_id) => ({ requisito_id: requisitoId, cargo_id, company_id: currentCompanyId })),
        );
        if (error) throw error;
      }
      if (addUnidades.length) {
        const { error } = await supabase.from("dp_requisito_unidades").insert(
          addUnidades.map((unidade_id) => ({ requisito_id: requisitoId, unidade_id, company_id: currentCompanyId })),
        );
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: chave });
      qc.invalidateQueries({ queryKey: ["dp-documento-requisitos"] });
    },
  });

  return { escopo, salvar };
}
