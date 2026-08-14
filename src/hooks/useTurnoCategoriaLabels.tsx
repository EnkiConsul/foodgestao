import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { CATEGORIAS_TURNO, type CategoriaLabels } from "@/lib/dp/turno-utils";

/**
 * Rótulos personalizados das categorias de turno (por empresa).
 * Guardados em dp_config_dp.turno_categoria_labels na linha padrão da empresa
 * (unidade_id nulo). Os códigos internos das categorias nunca mudam.
 */
export function useTurnoCategoriaLabels() {
  const { selectedCompanyId } = useCompanyContext();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["dp_turno_categoria_labels", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async (): Promise<{ id: string | null; labels: CategoriaLabels }> => {
      const { data, error } = await supabase
        .from("dp_config_dp")
        .select("id, turno_categoria_labels")
        .eq("company_id", selectedCompanyId!)
        .is("unidade_id", null)
        .maybeSingle();
      if (error) throw error;
      const raw = (data as { turno_categoria_labels?: unknown } | null)?.turno_categoria_labels;
      const labels: CategoriaLabels = {};
      if (raw && typeof raw === "object") {
        Object.entries(raw as Record<string, unknown>).forEach(([k, v]) => {
          if (typeof v === "string" && v.trim()) labels[k] = v.trim();
        });
      }
      return { id: (data as { id?: string } | null)?.id ?? null, labels };
    },
  });

  const labels = useMemo(() => query.data?.labels ?? {}, [query.data]);

  const salvar = useMutation({
    mutationFn: async (next: CategoriaLabels) => {
      if (!selectedCompanyId) throw new Error("Empresa não selecionada");
      // Guarda apenas os rótulos realmente personalizados.
      const limpo: CategoriaLabels = {};
      CATEGORIAS_TURNO.forEach((c) => {
        const v = next[c.v]?.trim();
        if (v && v !== c.label) limpo[c.v] = v;
      });

      const rowId = query.data?.id ?? null;
      if (rowId) {
        const { error } = await supabase
          .from("dp_config_dp")
          .update({ turno_categoria_labels: limpo })
          .eq("id", rowId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("dp_config_dp")
          .insert({ company_id: selectedCompanyId, unidade_id: null, turno_categoria_labels: limpo });
        if (error) throw error;
      }
      return limpo;
    },
    onSuccess: () =>
      void qc.invalidateQueries({ queryKey: ["dp_turno_categoria_labels", selectedCompanyId] }),
  });

  return { labels, isLoading: query.isLoading, salvar };
}
