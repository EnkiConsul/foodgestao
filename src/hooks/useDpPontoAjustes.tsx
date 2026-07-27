import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import type { Database } from "@/integrations/supabase/types";

export type PontoAjusteRow = Database["public"]["Tables"]["dp_ponto_ajustes"]["Row"] & {
  dp_colaboradores?: { nome: string } | null;
};

export type PontoAjusteAcao = Database["public"]["Enums"]["dp_ponto_ajuste_acao"];
export type PontoTipoEnum = Database["public"]["Enums"]["dp_ponto_tipo"];

export const AJUSTE_ACAO_LABEL: Record<PontoAjusteAcao, string> = {
  incluir: "Incluir marcação",
  alterar: "Corrigir horário",
  excluir: "Excluir marcação",
};

export interface NovoAjusteInput {
  company_id: string;
  colaborador_id: string;
  data: string;
  tipo: PontoTipoEnum;
  acao: PontoAjusteAcao;
  hora_solicitada: string | null;
  motivo: string;
}

/** Solicitações de ajuste do colaborador logado. */
export function useMeusAjustesPonto(colaboradorId: string | null) {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["dp_ponto_ajustes_meus", colaboradorId],
    enabled: !!colaboradorId,
    queryFn: async (): Promise<PontoAjusteRow[]> => {
      const { data, error } = await supabase
        .from("dp_ponto_ajustes")
        .select("*")
        .eq("colaborador_id", colaboradorId!)
        .order("data", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as PontoAjusteRow[];
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["dp_ponto_ajustes_meus"] });
    qc.invalidateQueries({ queryKey: ["dp_ponto_ajustes"] });
  };

  const solicitar = useMutation({
    mutationFn: async (input: NovoAjusteInput) => {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase.from("dp_ponto_ajustes").insert({
        ...input,
        hora_solicitada: input.acao === "excluir" ? null : input.hora_solicitada,
        criado_por: auth.user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const cancelar = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("dp_ponto_ajustes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return { ajustes: query.data ?? [], isLoading: query.isLoading, error: query.error, solicitar, cancelar };
}

/** Solicitações de ajuste da empresa (visão do DP). */
export function useDpPontoAjustes(colaboradorId?: string | null, apenasPendentes = false) {
  const { selectedCompanyId } = useCompanyContext();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["dp_ponto_ajustes", selectedCompanyId, colaboradorId ?? null, apenasPendentes],
    enabled: !!selectedCompanyId,
    queryFn: async (): Promise<PontoAjusteRow[]> => {
      let q = supabase
        .from("dp_ponto_ajustes")
        .select("*, dp_colaboradores(nome)")
        .eq("company_id", selectedCompanyId!)
        .order("created_at", { ascending: false })
        .limit(100);
      if (colaboradorId) q = q.eq("colaborador_id", colaboradorId);
      if (apenasPendentes) q = q.eq("status", "pendente");
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as PontoAjusteRow[];
    },
  });

  const analisar = useMutation({
    mutationFn: async (input: { id: string; aprovar: boolean; observacao?: string | null }) => {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("dp_ponto_ajustes")
        .update({
          status: input.aprovar ? "aprovado" : "recusado",
          observacao_analise: input.observacao ?? null,
          analisado_por: auth.user?.id ?? null,
          analisado_em: new Date().toISOString(),
        })
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dp_ponto_ajustes"] });
      qc.invalidateQueries({ queryKey: ["dp_ponto_ajustes_meus"] });
      qc.invalidateQueries({ queryKey: ["dp_pontos"] });
      qc.invalidateQueries({ queryKey: ["dp_meu_ponto"] });
    },
  });

  return { ajustes: query.data ?? [], isLoading: query.isLoading, error: query.error, analisar };
}
