import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import {
  normalizarCategorias, serializarCategorias, type CategoriaTurnoItem,
} from "@/lib/dp/turno-utils";

/**
 * Categorias de turno sob controle da empresa (nome, ordem, criação e exclusão).
 * Guardadas em dp_config_dp.turno_categoria_labels na linha padrão da empresa
 * (unidade_id nulo). Aceita o formato antigo `{ codigo: nome }` na leitura.
 */
export function useTurnoCategoriaLabels() {
  const { selectedCompanyId } = useCompanyContext();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["dp_turno_categoria_labels", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async (): Promise<{ id: string | null; categorias: CategoriaTurnoItem[] }> => {
      const { data, error } = await supabase
        .from("dp_config_dp")
        .select("id, turno_categoria_labels")
        .eq("company_id", selectedCompanyId!)
        .is("unidade_id", null)
        .maybeSingle();
      if (error) throw error;
      const raw = (data as { turno_categoria_labels?: unknown } | null)?.turno_categoria_labels;
      return {
        id: (data as { id?: string } | null)?.id ?? null,
        categorias: normalizarCategorias(raw),
      };
    },
  });

  const categorias = useMemo(
    () => query.data?.categorias ?? normalizarCategorias(null),
    [query.data],
  );

  const gravarLista = async (lista: CategoriaTurnoItem[]) => {
    if (!selectedCompanyId) throw new Error("Empresa não selecionada");
    const limpo = serializarCategorias(lista);
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
  };

  const salvar = useMutation({
    mutationFn: gravarLista,
    onSuccess: () =>
      void qc.invalidateQueries({ queryKey: ["dp_turno_categoria_labels", selectedCompanyId] }),
  });

  /** Exclui a categoria migrando os turnos que a usam para outra categoria. */
  const excluir = useMutation({
    mutationFn: async (input: { codigo: string; destino?: string | null; lista: CategoriaTurnoItem[] }) => {
      if (!selectedCompanyId) throw new Error("Empresa não selecionada");
      if (input.destino) {
        const { error } = await supabase
          .from("dp_turnos")
          .update({ categoria: input.destino })
          .eq("company_id", selectedCompanyId)
          .eq("categoria", input.codigo);
        if (error) throw error;
      }
      return gravarLista(input.lista.filter((c) => c.codigo !== input.codigo));
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["dp_turno_categoria_labels", selectedCompanyId] });
      void qc.invalidateQueries({ queryKey: ["dp_turnos"] });
    },
  });

  /** Quantos turnos usam cada categoria (para avisar antes de excluir). */
  const uso = useQuery({
    queryKey: ["dp_turno_categoria_uso", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async (): Promise<Record<string, number>> => {
      const { data, error } = await supabase
        .from("dp_turnos")
        .select("categoria")
        .eq("company_id", selectedCompanyId!);
      if (error) throw error;
      const contagem: Record<string, number> = {};
      (data ?? []).forEach((t) => {
        const c = (t as { categoria: string | null }).categoria;
        if (c) contagem[c] = (contagem[c] ?? 0) + 1;
      });
      return contagem;
    },
  });

  return {
    categorias,
    /** Compatibilidade: mapa codigo → nome. */
    labels: useMemo(
      () => Object.fromEntries(categorias.map((c) => [c.codigo, c.nome])) as Record<string, string>,
      [categorias],
    ),
    usoPorCategoria: uso.data ?? {},
    isLoading: query.isLoading,
    salvar,
    excluir,
  };
}
