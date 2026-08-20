import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  EMPTY_HIDDEN,
  effectiveHiddenRoutes,
  isRouteHidden,
  type HiddenScreensConfig,
} from "@/lib/nav/hiddenScreens";

const QUERY_KEY = ["app_hidden_screens"];

/**
 * Config global de telas em desenvolvimento (uma única linha no banco).
 * Leitura liberada para todos; escrita apenas para super admin (RLS).
 */
export function useHiddenScreens() {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: QUERY_KEY,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<HiddenScreensConfig> => {
      const { data, error } = await supabase
        .from("app_hidden_screens")
        .select("enabled, routes")
        .maybeSingle();
      if (error) {
        console.error("Erro ao carregar telas ocultas:", error);
        return EMPTY_HIDDEN;
      }
      if (!data) return EMPTY_HIDDEN;
      return { enabled: !!data.enabled, routes: (data.routes ?? []) as string[] };
    },
  });

  const config = data ?? EMPTY_HIDDEN;
  const hidden = useMemo(() => effectiveHiddenRoutes(config), [config]);

  const salvar = useMutation({
    mutationFn: async (next: Partial<HiddenScreensConfig>) => {
      const { data: userData } = await supabase.auth.getUser();
      const payload = {
        singleton: true,
        enabled: next.enabled ?? config.enabled,
        routes: next.routes ?? config.routes,
        updated_by: userData.user?.id ?? null,
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase
        .from("app_hidden_screens")
        .upsert(payload, { onConflict: "singleton" });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY });
    },
    onError: (error: unknown) => {
      console.error(error);
      toast.error("Não foi possível salvar as telas em desenvolvimento");
    },
  });

  return {
    /** Interruptor único: quando ligado, as telas marcadas ficam ocultas. */
    enabled: config.enabled,
    /** Rotas marcadas (independente do interruptor). */
    marcadas: config.routes,
    /** Rotas efetivamente ocultas agora. */
    hidden,
    isHidden: (to: string) => hidden.has(to),
    isPathHidden: (pathname: string) => isRouteHidden(pathname, hidden),
    loading: isLoading,
    saving: salvar.isPending,
    setEnabled: (enabled: boolean) => salvar.mutate({ enabled }),
    setRoutes: (routes: string[]) => salvar.mutate({ routes }),
  };
}
