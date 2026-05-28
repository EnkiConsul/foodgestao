import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { LEGAL_DEFAULTS, type LegalSection, type LegalContentMap } from "@/lib/legal-defaults";
import { toast } from "@/hooks/use-toast";

const QK = ["legal-content"] as const;

type Row = { section: string; content: Record<string, unknown> };

function deepMerge<T>(base: T, override: unknown): T {
  if (override === null || override === undefined) return base;
  if (Array.isArray(base)) return (Array.isArray(override) ? override : base) as T;
  if (typeof base === "object" && typeof override === "object") {
    const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
    for (const [k, v] of Object.entries(override as Record<string, unknown>)) {
      out[k] = deepMerge((base as Record<string, unknown>)[k], v);
    }
    return out as T;
  }
  return (override as T) ?? base;
}

export function useAllLegalContent() {
  return useQuery({
    queryKey: QK,
    staleTime: 60_000,
    queryFn: async () => {
      const sections = Object.keys(LEGAL_DEFAULTS);
      const { data, error } = await supabase
        .from("landing_content" as never)
        .select("section, content")
        .in("section", sections);
      if (error) throw error;
      const map: Record<string, Record<string, unknown>> = {};
      (data as Row[] | null)?.forEach((r) => (map[r.section] = r.content ?? {}));
      const merged = {} as LegalContentMap;
      (Object.keys(LEGAL_DEFAULTS) as LegalSection[]).forEach((k) => {
        (merged as Record<string, unknown>)[k] = deepMerge(
          LEGAL_DEFAULTS[k],
          map[k] ?? {}
        );
      });
      return merged;
    },
  });
}

export function useLegalSection<S extends LegalSection>(section: S): LegalContentMap[S] {
  const { data } = useAllLegalContent();
  return (data?.[section] ?? LEGAL_DEFAULTS[section]) as LegalContentMap[S];
}

export function useUpsertLegalSection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ section, content }: { section: LegalSection; content: unknown }) => {
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
      toast({ title: "Documento salvo", description: "As alterações foram publicadas." });
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : "Erro ao salvar";
      toast({ title: "Erro", description: msg, variant: "destructive" });
    },
  });
}

export function useResetLegalSection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (section: LegalSection) => {
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
