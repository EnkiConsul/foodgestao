import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type FeriasCoberturaDia = {
  data: string;
  cargo_id: string | null;
  turno_id: string | null;
  minimo: number;
  previstos: number;
  faltam: number;
};

/** Dias do período de férias em que a equipe fica abaixo do mínimo por cargo/turno. */
export function useDpFeriasCobertura(gozoId?: string | null) {
  return useQuery({
    queryKey: ["dp_ferias_cobertura", gozoId],
    enabled: !!gozoId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("dp_ferias_cobertura_sugestao" as any, {
        _gozo_id: gozoId!,
      });
      if (error) throw error;
      return (data ?? []) as unknown as FeriasCoberturaDia[];
    },
  });
}
