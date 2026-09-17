/**
 * Vínculo de um documento obrigatório com cargos e unidades da empresa.
 *
 * Sem esta configuração as regras por cargo/unidade não seriam utilizáveis:
 * a exigência vale para todos ou para ninguém. Os vínculos usam sempre os
 * cadastros canônicos (Cargos e Unidades), nunca comparação por nome.
 *
 * A gravação é uma substituição do conjunto inteiro, calculada a partir da
 * escolha atual da tela — nunca de uma leitura antiga guardada em memória —
 * e repetível: rodar de novo com a mesma escolha leva ao mesmo resultado.
 * A pertinência à mesma empresa é garantida no banco pelas chaves compostas
 * (requisito+empresa, cargo+empresa, unidade+empresa).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";

export interface EscopoRequisito {
  cargos: string[];
  unidades: string[];
}

/** Lista de identificadores no formato aceito pelo filtro `not.in`. */
const listaIds = (ids: string[]) => `(${ids.map((id) => `"${id}"`).join(",")})`;

export function useDpRequisitoEscopo(requisitoId: string | null) {
  const { selectedCompanyId: currentCompanyId } = useCompanyContext();
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

  const salvar = useMutation({
    mutationFn: async (novo: EscopoRequisito) => {
      if (!requisitoId || !currentCompanyId) throw new Error("Selecione uma empresa antes de salvar.");

      const cargos = [...new Set(novo.cargos)];
      const unidades = [...new Set(novo.unidades)];

      // Primeiro grava o que ficou marcado; só então retira o que saiu, para que
      // uma falha no meio nunca deixe a exigência sem nenhum cargo/unidade.
      if (cargos.length) {
        const { error } = await supabase.from("dp_requisito_cargos").upsert(
          cargos.map((cargo_id) => ({ requisito_id: requisitoId, cargo_id, company_id: currentCompanyId })),
          { onConflict: "requisito_id,cargo_id", ignoreDuplicates: true },
        );
        if (error) throw error;
      }
      if (unidades.length) {
        const { error } = await supabase.from("dp_requisito_unidades").upsert(
          unidades.map((unidade_id) => ({ requisito_id: requisitoId, unidade_id, company_id: currentCompanyId })),
          { onConflict: "requisito_id,unidade_id", ignoreDuplicates: true },
        );
        if (error) throw error;
      }

      const remCargos = supabase
        .from("dp_requisito_cargos")
        .delete()
        .eq("requisito_id", requisitoId)
        .eq("company_id", currentCompanyId);
      const { error: eCargos } = await (cargos.length
        ? remCargos.not("cargo_id", "in", listaIds(cargos))
        : remCargos);
      if (eCargos) throw eCargos;

      const remUnidades = supabase
        .from("dp_requisito_unidades")
        .delete()
        .eq("requisito_id", requisitoId)
        .eq("company_id", currentCompanyId);
      const { error: eUnidades } = await (unidades.length
        ? remUnidades.not("unidade_id", "in", listaIds(unidades))
        : remUnidades);
      if (eUnidades) throw eUnidades;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: chave });
      qc.invalidateQueries({ queryKey: ["dp-documento-requisitos"] });
      qc.invalidateQueries({ queryKey: ["dp_documento_requisitos"] });
    },
  });

  return { escopo, salvar };
}
