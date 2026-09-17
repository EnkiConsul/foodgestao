/**
 * Vínculo de um documento obrigatório com cargos e unidades da empresa.
 *
 * Sem esta configuração as regras por cargo/unidade não seriam utilizáveis:
 * a exigência vale para todos ou para ninguém. Os vínculos usam sempre os
 * cadastros canônicos (Cargos e Unidades), nunca comparação por nome.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";

export interface EscopoRequisito {
  cargos: string[];
  unidades: string[];
}

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

/** Lista de UUIDs no formato aceito pelo filtro `not.in` da API de dados. */
const listaIds = (ids: string[]) => `(${ids.map((id) => `"${id}"`).join(",")})`;

export function useDpRequisitoEscopoInterno() {}

    onSuccess: () => {
      qc.invalidateQueries({ queryKey: chave });
      qc.invalidateQueries({ queryKey: ["dp-documento-requisitos"] });
    },
  });

  return { escopo, salvar };
}
