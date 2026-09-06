import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { toast } from "sonner";

export type DpTrocaModo = "direta" | "aprovacao_admin" | "proibida";

export type DpTrocaRow = {
  id: string;
  company_id: string;
  solicitante_id: string;
  destino_id: string;
  data_original: string;
  data_proposta: string | null;
  motivo: string | null;
  status: string;
  colega_resposta: string | null;
  colega_respondido_em: string | null;
  gestor_resposta: string | null;
  gestor_respondido_em: string | null;
  created_at: string;
  solicitante: { nome: string | null } | null;
  destino: { nome: string | null; unidade_id: string | null } | null;
  /** Modo de troca resolvido pelas regras de folga da unidade do destinatário. */
  modo: DpTrocaModo;
};

export type ResponderTrocaInput = {
  id: string;
  aceito: boolean;
  obs?: string;
};

/**
 * Dados e mutations da tela de Trocas (DP, visão do gestor).
 * O gestor nunca responde em nome do colega: aprova (quando a unidade exige
 * aprovação), recusa ou cancela uma troca já aprovada.
 * `filtro` = "todos" ou um status de dp_trocas.
 */
export function useDpTrocas(filtro: string = "todos") {
  const { selectedCompanyId } = useCompanyContext();
  const qc = useQueryClient();

  const list = useQuery({
    queryKey: ["dp_trocas", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async (): Promise<DpTrocaRow[]> => {
      const { data, error } = await supabase
        .from("dp_trocas")
        .select("*, solicitante:solicitante_id(nome), destino:destino_id(nome, unidade_id)")
        .eq("company_id", selectedCompanyId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const rows = (data ?? []) as unknown as Omit<DpTrocaRow, "modo">[];

      // Resolve o modo de troca por unidade (cache local por unidade).
      const unidades = Array.from(
        new Set(rows.map((r) => r.destino?.unidade_id ?? null)),
      );
      const modos = new Map<string | null, DpTrocaModo>();
      for (const unidadeId of unidades) {
        const { data: cfg } = await supabase.rpc("dp_config_resolvida", {
          _company_id: selectedCompanyId!,
          _unidade_id: unidadeId ?? undefined,
        });
        const row = (Array.isArray(cfg) ? cfg[0] : cfg) as { troca_folga_modo?: string } | null;
        modos.set(unidadeId, (row?.troca_folga_modo as DpTrocaModo) ?? "aprovacao_admin");
      }

      return rows.map((r) => ({
        ...r,
        modo: modos.get(r.destino?.unidade_id ?? null) ?? "aprovacao_admin",
      }));
    },
  });

  const filtered = useMemo(() => {
    const rows = list.data ?? [];
    if (filtro === "todos") return rows;
    return rows.filter((r) => r.status === filtro);
  }, [list.data, filtro]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["dp_trocas"] });
    qc.invalidateQueries({ queryKey: ["dp_folgas"] });
    qc.invalidateQueries({ queryKey: ["dp_pendencias"] });
  };

  /** Decisão do gestor: aprovar (efetiva a troca) ou recusar com justificativa. */
  const responder = useMutation({
    mutationFn: async ({ id, aceito, obs }: ResponderTrocaInput) => {
      const now = new Date().toISOString();
      const { data: userRes } = await supabase.auth.getUser();

      if (!aceito) {
        const { error } = await supabase.from("dp_trocas").update({
          gestor_resposta: obs ? `recusada: ${obs}` : "recusada",
          gestor_respondido_em: now,
          gestor_id: userRes.user?.id ?? null,
          status: "recusada",
        }).eq("id", id);
        if (error) throw error;
        return;
      }

      const { error: upErr } = await supabase.from("dp_trocas").update({
        gestor_resposta: "aprovada",
        gestor_respondido_em: now,
        gestor_id: userRes.user?.id ?? null,
      }).eq("id", id);
      if (upErr) throw upErr;

      const { error: rpcErr } = await supabase.rpc("dp_processar_troca", { _troca_id: id });
      if (rpcErr) throw rpcErr;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Resposta registrada");
    },
    onError: (e: unknown) => toast.error((e as Error)?.message ?? "Erro"),
  });

  /** Cancela uma troca já aprovada, revertendo as folgas envolvidas. */
  const cancelar = useMutation({
    mutationFn: async ({ id, motivo }: { id: string; motivo: string }) => {
      const { error } = await supabase.rpc("dp_cancelar_troca", {
        _troca_id: id,
        _motivo: motivo,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Troca cancelada");
    },
    onError: (e: unknown) => toast.error((e as Error)?.message ?? "Erro"),
  });

  const remover = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("dp_trocas").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Removido");
    },
    onError: (e: unknown) => toast.error((e as Error)?.message ?? "Erro"),
  });

  return {
    rows: filtered,
    isLoading: list.isLoading,
    responder,
    cancelar,
    remover,
  };
}

