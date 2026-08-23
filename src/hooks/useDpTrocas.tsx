import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { toast } from "sonner";

export type DpTrocaEtapa = "colega" | "gestor";

export type ResponderTrocaInput = {
  id: string;
  etapa: DpTrocaEtapa;
  aceito: boolean;
  obs?: string;
};

/**
 * Dados e mutations da tela de Trocas (DP).
 * `filtro` = "todos" ou um status de dp_trocas.
 */
export function useDpTrocas(filtro: string = "todos") {
  const { selectedCompanyId } = useCompanyContext();
  const qc = useQueryClient();

  const list = useQuery({
    queryKey: ["dp_trocas", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dp_trocas")
        .select("*, solicitante:solicitante_id(nome), destino:destino_id(nome, unidade_id)")
        .eq("company_id", selectedCompanyId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const filtered = useMemo(() => {
    const rows = (list.data ?? []) as any[];
    if (filtro === "todos") return rows;
    return rows.filter((r) => r.status === filtro);
  }, [list.data, filtro]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["dp_trocas"] });
    qc.invalidateQueries({ queryKey: ["dp_pendencias"] });
  };

  const responder = useMutation({
    mutationFn: async ({ id, etapa, aceito, obs }: ResponderTrocaInput) => {
      const now = new Date().toISOString();
      const { data: userRes } = await supabase.auth.getUser();

      if (etapa === "colega") {
        const { error } = await supabase.from("dp_trocas").update({
          colega_resposta: obs ?? (aceito ? "aprovada" : "recusada"),
          colega_respondido_em: now,
          status: aceito ? "pendente_gestor" : "recusada",
        }).eq("id", id);
        if (error) throw error;
        if (!aceito) return;

        // Unidade com troca direta: o aceite do colega já efetiva a troca.
        const troca = ((list.data ?? []) as any[]).find((r) => r.id === id);
        const unidadeId = troca?.destino?.unidade_id ?? null;
        const { data: cfg } = await supabase.rpc("dp_config_resolvida", {
          _company_id: selectedCompanyId!,
          _unidade_id: unidadeId ?? undefined,
        });
        const row = (Array.isArray(cfg) ? cfg[0] : cfg) as { troca_folga_modo?: string } | null;
        if (row?.troca_folga_modo === "direta") {
          const { error: dirErr } = await supabase.rpc("dp_processar_troca_direta", { _troca_id: id });
          if (dirErr) throw dirErr;
        }
        return;
      }


      if (!aceito) {
        const { error } = await supabase.from("dp_trocas").update({
          gestor_resposta: obs ?? "recusada",
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
    onError: (e: any) => toast.error(e?.message ?? "Erro"),
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
    onError: (e: any) => toast.error(e?.message ?? "Erro"),
  });

  return {
    rows: filtered,
    isLoading: list.isLoading,
    responder,
    remover,
  };
}
