// ------------------------------------------------------------------
// Domínio: DP → Regras de VA/VT no Cadastro de Benefícios.
//
// Vale-alimentação e vale-transporte não são itens soltos do catálogo: são
// regras da empresa que descem por unidade e cargo até o colaborador. Esta
// camada lê e grava o padrão da empresa (dp_config_dp) e liga/desliga o
// benefício para empresas que não o usam, sem duplicar a lógica que já existe
// no cadastro do colaborador.
// ------------------------------------------------------------------

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import type { ValeTipo } from "@/hooks/useDpValeCalculadora";

const KEY = "dp_vale_regras";

export interface ValeRegrasEmpresa {
  id: string | null;
  va_ativo: boolean;
  vt_ativo: boolean;
  va_dia_pagamento: number | null;
  va_dias_corte: number | null;
  vt_dia_pagamento: number | null;
  vt_dias_corte: number | null;
}

const COLUNAS =
  "id, va_ativo, vt_ativo, va_dia_pagamento, va_dias_corte, vt_dia_pagamento, vt_dias_corte";

/** Regra de retaguarda da empresa (unidade_id nulo). */
export function useDpValeRegrasEmpresa() {
  const { selectedCompanyId } = useCompanyContext();
  return useQuery({
    queryKey: [KEY, selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async (): Promise<ValeRegrasEmpresa> => {
      const { data, error } = await supabase
        .from("dp_config_dp")
        .select(COLUNAS)
        .eq("company_id", selectedCompanyId!)
        .is("unidade_id", null)
        .maybeSingle();
      if (error) throw error;
      const r = (data ?? {}) as Record<string, any>;
      return {
        id: r.id ?? null,
        va_ativo: r.va_ativo ?? true,
        vt_ativo: r.vt_ativo ?? true,
        va_dia_pagamento: r.va_dia_pagamento ?? null,
        va_dias_corte: r.va_dias_corte ?? null,
        vt_dia_pagamento: r.vt_dia_pagamento ?? null,
        vt_dias_corte: r.vt_dias_corte ?? null,
      };
    },
  });
}

/**
 * Grava o padrão da empresa para o vale (dia do depósito, corte e o que
 * desconta) e, se pedido, desliga o benefício para todo mundo — usado quando a
 * empresa não concede o vale.
 */
export function useSalvarValeRegrasEmpresa() {
  const qc = useQueryClient();
  const { selectedCompanyId } = useCompanyContext();
  return useMutation({
    mutationFn: async (input: {
      tipo: ValeTipo;
      patch: Record<string, unknown>;
      /** Desliga o vale também na ficha dos colaboradores ativos. */
      desligarColaboradores?: boolean;
    }) => {
      if (!selectedCompanyId) throw new Error("Empresa não selecionada");

      const { data: existente, error: erroBusca } = await supabase
        .from("dp_config_dp")
        .select("id")
        .eq("company_id", selectedCompanyId)
        .is("unidade_id", null)
        .maybeSingle();
      if (erroBusca) throw erroBusca;

      if (existente?.id) {
        const { error } = await supabase
          .from("dp_config_dp")
          .update(input.patch as any)
          .eq("id", existente.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("dp_config_dp")
          .insert({ ...(input.patch as any), company_id: selectedCompanyId, unidade_id: null });
        if (error) throw error;
      }

      if (input.desligarColaboradores) {
        const campo = input.tipo === "va" ? "vale_alimentacao" : "vale_transporte";
        const { error } = await supabase
          .from("dp_colaboradores")
          .update({ [campo]: false } as any)
          .eq("company_id", selectedCompanyId)
          .is("data_desligamento", null);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [KEY, selectedCompanyId] });
      void qc.invalidateQueries({ queryKey: ["dp_config_dp", selectedCompanyId] });
      void qc.invalidateQueries({ queryKey: ["dp_config_dp_vale"] });
      void qc.invalidateQueries({ queryKey: ["dp_colaboradores"] });
      void qc.invalidateQueries({ queryKey: ["dp_vale_calculadora"] });
    },
  });
}
