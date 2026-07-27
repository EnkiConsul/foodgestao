import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import type { Database } from "@/integrations/supabase/types";
import type { Marcacao, PontoTipo } from "@/lib/dp/ponto";

export type PontoRow = Database["public"]["Tables"]["dp_pontos"]["Row"] & {
  dp_colaboradores?: { nome: string } | null;
};

const chave = (colaborador_id: string, data: string) => `${colaborador_id}|${data}`;

/** Marcações de ponto do colaborador logado em um intervalo. */
export function useMeuPonto(colaboradorId: string | null, inicio: string, fim: string) {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["dp_meu_ponto", colaboradorId, inicio, fim],
    enabled: !!colaboradorId,
    queryFn: async (): Promise<PontoRow[]> => {
      const { data, error } = await supabase
        .from("dp_pontos")
        .select("*")
        .eq("colaborador_id", colaboradorId!)
        .gte("data", inicio)
        .lte("data", fim)
        .order("registrado_em");
      if (error) throw error;
      return (data ?? []) as PontoRow[];
    },
  });

  const registrar = useMutation({
    mutationFn: async ({
      tipo,
      data,
      companyId,
      unidadeId,
    }: {
      tipo: PontoTipo;
      data: string;
      companyId: string;
      unidadeId?: string | null;
    }) => {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase.from("dp_pontos").insert({
        company_id: companyId,
        colaborador_id: colaboradorId!,
        unidade_id: unidadeId ?? null,
        data,
        tipo,
        origem: "portal",
        registrado_por: auth.user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dp_meu_ponto"] });
      qc.invalidateQueries({ queryKey: ["dp_pontos"] });
    },
  });

  const porData = useMemo(() => {
    const m = new Map<string, Marcacao[]>();
    for (const r of query.data ?? []) {
      const lista = m.get(r.data) ?? [];
      lista.push({ tipo: r.tipo, registrado_em: r.registrado_em, origem: r.origem, observacao: r.observacao });
      m.set(r.data, lista);
    }
    return m;
  }, [query.data]);

  return { rows: query.data ?? [], porData, isLoading: query.isLoading, error: query.error, registrar };
}

/** Marcações da empresa (espelho de ponto administrativo). */
export function useDpPontos(inicio: string, fim: string, colaboradorId?: string | null) {
  const { selectedCompanyId } = useCompanyContext();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["dp_pontos", selectedCompanyId, inicio, fim, colaboradorId ?? null],
    enabled: !!selectedCompanyId,
    queryFn: async (): Promise<PontoRow[]> => {
      let q = supabase
        .from("dp_pontos")
        .select("*, dp_colaboradores(nome)")
        .eq("company_id", selectedCompanyId!)
        .gte("data", inicio)
        .lte("data", fim)
        .order("registrado_em");
      if (colaboradorId) q = q.eq("colaborador_id", colaboradorId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as PontoRow[];
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["dp_pontos"] });

  const lancar = useMutation({
    mutationFn: async (input: {
      colaborador_id: string;
      data: string;
      tipo: PontoTipo;
      hora: string;
      unidade_id?: string | null;
      observacao?: string | null;
    }) => {
      if (!selectedCompanyId) throw new Error("Selecione uma empresa.");
      const { data: auth } = await supabase.auth.getUser();
      const registrado_em = new Date(`${input.data}T${input.hora}:00`).toISOString();
      const { error } = await supabase.from("dp_pontos").upsert(
        {
          company_id: selectedCompanyId,
          colaborador_id: input.colaborador_id,
          unidade_id: input.unidade_id ?? null,
          data: input.data,
          tipo: input.tipo,
          registrado_em,
          origem: "admin",
          observacao: input.observacao ?? null,
          ajustado_por: auth.user?.id ?? null,
        },
        { onConflict: "colaborador_id,data,tipo" },
      );
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const remover = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("dp_pontos").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const porColaboradorData = useMemo(() => {
    const m = new Map<string, Marcacao[]>();
    for (const r of query.data ?? []) {
      const k = chave(r.colaborador_id, r.data);
      const lista = m.get(k) ?? [];
      lista.push({ tipo: r.tipo, registrado_em: r.registrado_em, origem: r.origem, observacao: r.observacao });
      m.set(k, lista);
    }
    return m;
  }, [query.data]);

  return {
    rows: query.data ?? [],
    porColaboradorData,
    isLoading: query.isLoading,
    error: query.error,
    lancar,
    remover,
  };
}
