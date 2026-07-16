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
            favoritos: merged.favoritos,
            pendencias_adiadas: merged.pendencias_adiadas,
            avisos_confirmados: merged.avisos_confirmados,
            extras: merged.extras,
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

  return {
    prefs: query.data ?? DEFAULT,
    isLoading: query.isLoading,
    save: save.mutate,
    saving: save.isPending,
  };
}
