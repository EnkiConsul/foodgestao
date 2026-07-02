import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompanyContext } from "@/hooks/useCompanyContext";

export type PlinIAInsight = {
  tipo: "alerta" | "tendencia" | "oportunidade";
  titulo: string;
  mensagem: string;
};

export function usePlinIAInsights(enabled = true) {
  const { user } = useAuth();
  const { contextType, selectedCompanyId } = useCompanyContext();

  return useQuery({
    queryKey: ["plin-ia-insights", user?.id, contextType, selectedCompanyId],
    enabled: enabled && !!user,
    staleTime: 15 * 60_000,
    gcTime: 30 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("plin-ia-insights", {
        body: {
          context: contextType,
          companyId: contextType === "pj" ? selectedCompanyId : null,
        },
      });
      if (error) throw error;
      return (data?.insights ?? []) as PlinIAInsight[];
    },
  });
}

export function usePlinIAUsage() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["plin-ia-usage", user?.id],
    enabled: !!user,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_ia_usage_today");
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return {
        messagesCount: Number(row?.messages_count ?? 0),
        tokensUsed: Number(row?.tokens_used ?? 0),
        quotaPerDay: Number(row?.quota_per_day ?? 0),
        aiEnabled: !!row?.ai_enabled,
      };
    },
  });
}
