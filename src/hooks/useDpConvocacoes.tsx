import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import type { Database } from "@/integrations/supabase/types";
import { snapshotDaConvocacao, type NovaConvocacaoInput } from "@/lib/dp/convocacoes";

export type ConvocacaoRow = Database["public"]["Tables"]["dp_convocacoes"]["Row"] & {
  dp_colaboradores?: { nome: string; regime: string | null } | null;
  dp_turnos?: { nome: string } | null;
};

export interface NovaConvocacao extends NovaConvocacaoInput {
  colaborador_id: string;
  unidade_id: string | null;
  turno_id: string | null;
  observacao: string | null;
}

/** Convocações da empresa (visão administrativa) para um intervalo de datas. */
export function useDpConvocacoes(inicio: string, fim: string, colaboradorId?: string | null) {
  const { selectedCompanyId } = useCompanyContext();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["dp_convocacoes", selectedCompanyId, inicio, fim, colaboradorId ?? null],
    enabled: !!selectedCompanyId,
    queryFn: async (): Promise<ConvocacaoRow[]> => {
      let q = supabase
        .from("dp_convocacoes")
        .select(
          "*, dp_colaboradores!dp_convocacoes_colaborador_id_fkey(nome, regime), dp_turnos(nome)",
        )
        .eq("company_id", selectedCompanyId!)
        .gte("data", inicio)
        .lte("data", fim)
        .order("data");
      if (colaboradorId) q = q.eq("colaborador_id", colaboradorId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as ConvocacaoRow[];
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["dp_convocacoes"] });

  const criar = useMutation({
    mutationFn: async (form: NovaConvocacao) => {
      if (!selectedCompanyId) throw new Error("Selecione uma empresa.");
      const snap = snapshotDaConvocacao(form);
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase.from("dp_convocacoes").insert({
        company_id: selectedCompanyId,
        colaborador_id: form.colaborador_id,
        unidade_id: form.unidade_id,
        turno_id: form.turno_id,
        data: form.data,
        prazo_resposta: form.prazo_resposta ?? null,
        observacao: form.observacao,
        criada_por: auth.user?.id ?? null,
        ...snap,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const cancelar = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("dp_convocacoes")
        .update({ status: "cancelada" })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const remover = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("dp_convocacoes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return { rows: query.data ?? [], isLoading: query.isLoading, error: query.error, criar, cancelar, remover };
}

/** Convocações do colaborador logado (Portal). */
export function useMinhasConvocacoes(colaboradorId: string | null) {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["dp_minhas_convocacoes", colaboradorId],
    enabled: !!colaboradorId,
    queryFn: async (): Promise<ConvocacaoRow[]> => {
      const { data, error } = await supabase
        .from("dp_convocacoes")
        .select("*, dp_turnos(nome)")
        .eq("colaborador_id", colaboradorId!)
        .order("data", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ConvocacaoRow[];
    },
  });

  /**
   * Resposta pela RPC atômica: vagas de oferta aberta, prazo, dia já iniciado e
   * limite de uma convocação aceita por dia são decididos no servidor.
   */
  const responder = useMutation({
    mutationFn: async ({ id, aceito, motivo }: { id: string; aceito: boolean; motivo?: string }) => {
      const { data, error } = await supabase.rpc("dp_convocacao_responder_oferta", {
        p_convocacao_id: id,
        p_aceito: aceito,
        p_motivo: motivo ?? undefined,
      });
      if (error) throw error;
      return data as any;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dp_minhas_convocacoes"] });
      qc.invalidateQueries({ queryKey: ["dp_convocacoes"] });
    },
  });

  const pendentes = useMemo(
    () => (query.data ?? []).filter((c) => c.status === "pendente"),
    [query.data],
  );

  return { rows: query.data ?? [], pendentes, isLoading: query.isLoading, responder };
}
