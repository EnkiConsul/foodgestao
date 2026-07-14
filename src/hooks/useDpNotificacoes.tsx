import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import type { Database } from "@/integrations/supabase/types";

export type DpNotificacao = Database["public"]["Tables"]["dp_notificacoes"]["Row"];

export function useDpNotificacoes(opts?: { onlyUnread?: boolean }) {
  const { selectedCompanyId } = useCompanyContext();
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["dp_notificacoes", selectedCompanyId, opts?.onlyUnread ?? false],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      let query = supabase
        .from("dp_notificacoes")
        .select("*")
        .eq("company_id", selectedCompanyId!)
        .order("created_at", { ascending: false })
        .limit(50);
      if (opts?.onlyUnread) query = query.is("lida_em", null);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as DpNotificacao[];
    },
  });

  useEffect(() => {
    if (!selectedCompanyId) return;
    const channel = supabase
      .channel(`dp_notif_${selectedCompanyId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "dp_notificacoes", filter: `company_id=eq.${selectedCompanyId}` },
        () => qc.invalidateQueries({ queryKey: ["dp_notificacoes", selectedCompanyId] }),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [selectedCompanyId, qc]);

  return q;
}

export function useMarkNotifRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      if (ids.length === 0) return;
      const { error } = await supabase
        .from("dp_notificacoes")
        .update({ lida_em: new Date().toISOString() })
        .in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dp_notificacoes"] }),
  });
}
