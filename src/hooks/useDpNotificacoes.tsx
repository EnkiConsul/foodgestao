import { useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useAuth } from "@/hooks/useAuth";
import type { Database } from "@/integrations/supabase/types";
import { notificacaoLida } from "@/lib/dp/notificacoes";
import { useMeuVinculoPortal } from "@/hooks/useMeuVinculoPortal";

export type DpNotificacaoRow = Database["public"]["Tables"]["dp_notificacoes"]["Row"];
export type DpNotificacao = DpNotificacaoRow & { lida: boolean };

/**
 * Lista as notificações visíveis para o usuário atual (RLS garante a audiência:
 * pessoais só do próprio usuário; compartilhadas somente para gestores).
 * O estado de leitura é individual por destinatário.
 */
export function useDpNotificacoes(opts?: { onlyUnread?: boolean; variant?: "admin" | "portal" }) {
  const { selectedCompanyId } = useCompanyContext();
  const vinculo = useMeuVinculoPortal();
  const { user } = useAuth();
  const qc = useQueryClient();
  // No portal a empresa vem do vínculo autenticado, nunca do seletor
  // administrativo de empresa.
  const companyId = opts?.variant === "portal" ? vinculo.data?.companyId ?? null : selectedCompanyId;

  const q = useQuery({
    queryKey: ["dp_notificacoes", companyId, user?.id],
    enabled: !!companyId && !!user?.id,
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("dp_notificacoes")
        .select("*")
        .eq("company_id", companyId!)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      const list = (rows ?? []) as DpNotificacaoRow[];

      // Leituras individuais do usuário atual nas notificações compartilhadas.
      const sharedIds = list.filter((n) => !n.user_id).map((n) => n.id);
      const leiturasIds = new Set<string>();
      if (sharedIds.length) {
        const { data: leituras } = await supabase
          .from("dp_notificacoes_leituras")
          .select("notificacao_id")
          .in("notificacao_id", sharedIds)
          .eq("user_id", user!.id);
        for (const l of leituras ?? []) leiturasIds.add(l.notificacao_id);
      }

      return list.map((n) => ({
        ...n,
        lida: notificacaoLida(n, leiturasIds, n.id),
      })) as DpNotificacao[];
    },
  });

  const filtered = useMemo(() => {
    const list = q.data ?? [];
    return opts?.onlyUnread ? list.filter((n) => !n.lida) : list;
  }, [q.data, opts?.onlyUnread]);

  useEffect(() => {
    if (!companyId) return;
    const channel = supabase
      .channel(`dp_notif_${companyId}_${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "dp_notificacoes", filter: `company_id=eq.${companyId}` },
        () => qc.invalidateQueries({ queryKey: ["dp_notificacoes", companyId] }),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [companyId, qc]);

  return { ...q, data: filtered };
}

/** Marca como lidas somente as notificações do usuário atual (via RPC com escopo próprio). */
export function useMarkNotifRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      if (ids.length === 0) return;
      const { error } = await supabase.rpc("dp_notificacao_marcar_lida", { _ids: ids });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dp_notificacoes"] }),
  });
}

/** Marcar todas como lidas: afeta apenas o que o usuário atual pode ver. */
export function useMarkAllNotifsRead(opts?: { variant?: "admin" | "portal" }) {
  const { selectedCompanyId } = useCompanyContext();
  const vinculo = useMeuVinculoPortal();
  const companyIdAtual = opts?.variant === "portal" ? vinculo.data?.companyId ?? null : selectedCompanyId;
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!companyIdAtual) return;
      const { error } = await supabase.rpc("dp_notificacoes_marcar_todas", { _company_id: companyIdAtual });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dp_notificacoes"] }),
  });
}
