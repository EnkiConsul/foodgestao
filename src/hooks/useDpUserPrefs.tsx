import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompanyContext } from "@/hooks/useCompanyContext";

export type DpUserPrefs = {
  favoritos: string[]; // labels na ordem escolhida
  pendencias_adiadas: Record<string, string>; // { [id]: ISO date }
  avisos_confirmados: string[]; // ids
  extras: Record<string, unknown>;
};

const DEFAULT: DpUserPrefs = {
  favoritos: [],
  pendencias_adiadas: {},
  avisos_confirmados: [],
  extras: {},
};

export function useDpUserPrefs() {
  const { user } = useAuth();
  const { selectedCompanyId } = useCompanyContext();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["dp_user_prefs", user?.id, selectedCompanyId],
    enabled: !!user?.id && !!selectedCompanyId,
    queryFn: async (): Promise<DpUserPrefs> => {
      const { data } = await supabase
        .from("dp_user_prefs")
        .select("favoritos, pendencias_adiadas, avisos_confirmados, extras")
        .eq("user_id", user!.id)
        .eq("company_id", selectedCompanyId!)
        .maybeSingle();
      if (!data) return DEFAULT;
      return {
        favoritos: (data.favoritos as string[]) ?? [],
        pendencias_adiadas: (data.pendencias_adiadas as Record<string, string>) ?? {},
        avisos_confirmados: (data.avisos_confirmados as string[]) ?? [],
        extras: (data.extras as Record<string, unknown>) ?? {},
      };
    },
  });

  const save = useMutation({
    mutationFn: async (patch: Partial<DpUserPrefs>) => {
      const current = query.data ?? DEFAULT;
      const merged = { ...current, ...patch };
      const { error } = await supabase
        .from("dp_user_prefs")
        .upsert(
          {
            user_id: user!.id,
            company_id: selectedCompanyId!,
            favoritos: merged.favoritos as any,
            pendencias_adiadas: merged.pendencias_adiadas as any,
            avisos_confirmados: merged.avisos_confirmados as any,
            extras: merged.extras as any,
          },
          { onConflict: "user_id,company_id" },
        );
      if (error) throw error;
      return merged;
    },
    onSuccess: (merged) => {
      qc.setQueryData(["dp_user_prefs", user?.id, selectedCompanyId], merged);
    },
  });

  const favoritePages: string[] = Array.isArray((query.data?.extras as any)?.favoritos_paginas)
    ? ((query.data!.extras as any).favoritos_paginas as string[])
    : [];

  const isFavoritePage = (route: string) => favoritePages.includes(route);

  const toggleFavoritePage = (route: string) => {
    const current = favoritePages;
    const next = current.includes(route)
      ? current.filter((r) => r !== route)
      : [...current, route];
    save.mutate({
      extras: { ...(query.data?.extras ?? {}), favoritos_paginas: next },
    });
  };

  return {
    prefs: query.data ?? DEFAULT,
    isLoading: query.isLoading,
    available: !!user?.id && !!selectedCompanyId,
    save: save.mutate,
    saving: save.isPending,
    favoritePages,
    isFavoritePage,
    toggleFavoritePage,
  };
}


