import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import type { ColaboradorAnalytics } from "@/lib/dp/analytics/equipe";
import {
  colaboradorNoFiltro,
  dimensaoSetorAtiva,
  setoresDisponiveis,
  type AnalyticsFiltros,
  type SetorRef,
} from "@/lib/dp/analytics/filtros";

export interface Ref {
  id: string;
  nome: string;
}

/**
 * Base de cadastro do Analytics: pessoas, unidades, cargos e setores.
 * É a única fonte dos filtros e dos rótulos das outras abas.
 */
export function useAnalyticsCadastro(filtros: AnalyticsFiltros) {
  const { selectedCompanyId } = useCompanyContext();
  const enabled = !!selectedCompanyId;

  const query = useQuery({
    queryKey: ["dp_analytics_cadastro", selectedCompanyId],
    enabled,
    queryFn: async () => {
      const [colabs, unidades, cargos, setores] = await Promise.all([
        supabase
          .from("dp_colaboradores")
          .select(
            "id, nome, unidade_id, cargo_id, setor_id, regime, vinculo_label, data_admissao, data_desligamento, ativo, motivo_desligamento",
          )
          .eq("company_id", selectedCompanyId!)
          .order("nome"),
        supabase
          .from("dp_unidades")
          .select("id, nome")
          .eq("company_id", selectedCompanyId!)
          .order("nome"),
        supabase
          .from("dp_cargos")
          .select("id, nome")
          .eq("company_id", selectedCompanyId!)
          .order("nome"),
        supabase
          .from("dp_setores")
          .select("id, nome, unidade_id, ativo")
          .eq("company_id", selectedCompanyId!)
          .order("nome"),
      ]);
      const err = [colabs, unidades, cargos, setores].find((r) => r.error);
      if (err?.error) throw err.error;
      return {
        colaboradores: (colabs.data ?? []) as (ColaboradorAnalytics & {
          motivo_desligamento: string | null;
        })[],
        unidades: (unidades.data ?? []) as Ref[],
        cargos: (cargos.data ?? []) as Ref[],
        setores: (setores.data ?? []) as SetorRef[],
      };
    },
  });

  const unidades = query.data?.unidades ?? [];
  const cargos = query.data?.cargos ?? [];
  const setores = query.data?.setores ?? [];

  const colaboradores = useMemo(
    () => (query.data?.colaboradores ?? []).filter((c) => colaboradorNoFiltro(c, filtros)),
    [query.data, filtros],
  );

  const nomes = useMemo(() => {
    const un = new Map(unidades.map((u) => [u.id, u.nome]));
    const cg = new Map(cargos.map((c) => [c.id, c.nome]));
    const st = new Map(setores.map((s) => [s.id, s.nome]));
    return {
      unidade: (id: string | null) => (id ? un.get(id) ?? "Unidade removida" : "Sem unidade"),
      cargo: (id: string | null) => (id ? cg.get(id) ?? "Cargo removido" : "Sem cargo"),
      setor: (id: string | null) => (id ? st.get(id) ?? "Setor removido" : "Sem setor"),
    };
  }, [unidades, cargos, setores]);

  const vinculos = useMemo(() => {
    const set = new Set<string>();
    (query.data?.colaboradores ?? []).forEach((c) => c.regime && set.add(c.regime));
    return [...set].sort();
  }, [query.data]);

  return {
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
    todos: query.data?.colaboradores ?? [],
    colaboradores,
    colabIds: useMemo(() => new Set(colaboradores.map((c) => c.id)), [colaboradores]),
    unidades,
    cargos,
    setores,
    setoresDoFiltro: setoresDisponiveis(setores, filtros.unidade),
    usaSetores: dimensaoSetorAtiva(setores),
    vinculos,
    nomes,
  };
}
