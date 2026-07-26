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

  // ── Atalhos personalizáveis da BottomNav mobile ────────────────────────
  // Estrutura: extras.mobile_shortcuts = { [module]: { a?, b?, c? } }
  type ShortcutSlot = "a" | "b" | "c";
  type ShortcutsMap = Record<string, Partial<Record<ShortcutSlot, string>>>;

  const mobileShortcuts: ShortcutsMap =
    (query.data?.extras as any)?.mobile_shortcuts && typeof (query.data!.extras as any).mobile_shortcuts === "object"
      ? ((query.data!.extras as any).mobile_shortcuts as ShortcutsMap)
      : {};

  const setMobileShortcut = (mod: string, slot: ShortcutSlot, to: string) => {
    const currentExtras = query.data?.extras ?? {};
    const currentMap = (currentExtras as any).mobile_shortcuts ?? {};
    const nextMap: ShortcutsMap = {
      ...currentMap,
      [mod]: { ...(currentMap[mod] ?? {}), [slot]: to },
    };
    save.mutate({
      extras: { ...currentExtras, mobile_shortcuts: nextMap },
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
    mobileShortcuts,
    setMobileShortcut,
  };
}


