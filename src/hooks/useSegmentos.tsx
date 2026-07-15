import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface Segmento {
  id: string;
  nome: string;
  slug: string;
  ordem: number;
}

export function useSegmentos() {
  return useQuery({
    queryKey: ["segmentos"],
    queryFn: async (): Promise<Segmento[]> => {
      const { data, error } = await supabase
        .from("segmentos" as any)
        .select("id, nome, slug, ordem")
        .eq("ativo", true)
        .order("ordem", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as Segmento[];
    },
    staleTime: 60 * 60 * 1000,
  });
}
