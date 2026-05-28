import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { LANDING_DEFAULTS, type LandingSection, type LandingContentMap } from "@/lib/landing-defaults";
import { toast } from "@/hooks/use-toast";

const QK = ["landing-content"] as const;

type Row = { section: string; content: Record<string, unknown> };

function deepMerge<T>(base: T, override: unknown): T {
  if (override === null || override === undefined) return base;
  if (Array.isArray(base)) {
    // Arrays: se houver override array, usa o override por inteiro
    return (Array.isArray(override) ? override : base) as T;
  }
  if (typeof base === "object" && typeof override === "object") {
    const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
    for (const [k, v] of Object.entries(override as Record<string, unknown>)) {
      out[k] = deepMerge((base as Record<string, unknown>)[k], v);
    }
    return out as T;
  }
  return (override as T) ?? base;
}

export function useAllLandingContent() {
  return useQuery({
    queryKey: QK,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("landing_content" as never)
        .select("section, content");
      if (error) throw error;
      const map: Record<string, Record<string, unknown>> = {};
      (data as Row[] | null)?.forEach((r) => (map[r.section] = r.content ?? {}));
      // Faz merge com defaults
      const merged = {} as LandingContentMap;
      (Object.keys(LANDING_DEFAULTS) as LandingSection[]).forEach((k) => {
        (merged as Record<string, unknown>)[k] = deepMerge(
          LANDING_DEFAULTS[k],
          map[k] ?? {}
        );
      });
      return merged;
    },
  });
}

export function useLandingSection<S extends LandingSection>(section: S): LandingContentMap[S] {
  const { data } = useAllLandingContent();
  return (data?.[section] ?? LANDING_DEFAULTS[section]) as LandingContentMap[S];
}

export function useUpsertLandingSection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ section, content }: { section: LandingSection; content: unknown }) => {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("landing_content" as never)
        .upsert(
          { section, content, updated_by: auth.user?.id ?? null } as never,
          { onConflict: "section" }
        );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK });
      toast({ title: "Conteúdo salvo", description: "A landing page foi atualizada." });
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : "Erro ao salvar";
      toast({ title: "Erro", description: msg, variant: "destructive" });
    },
  });
}

export function useResetLandingSection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (section: LandingSection) => {
      const { error } = await supabase
        .from("landing_content" as never)
        .delete()
        .eq("section", section);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK });
      toast({ title: "Restaurado", description: "Texto padrão restabelecido." });
    },
  });
}
