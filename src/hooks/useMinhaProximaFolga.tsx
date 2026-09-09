import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  proximaFolga as calcularProximaFolga,
  type ConfigDia,
  type FolgaLancada,
  type ItemEscalaFolga,
} from "@/lib/dp/proxima-folga";

/**
 * Próxima folga do colaborador considerando qualquer motivo:
 * folga lançada, folga da escala publicada e folga semanal fixa.
 */
export function useMinhaProximaFolga(colaboradorId: string | null | undefined) {
  const hoje = new Date().toISOString().slice(0, 10);
  const limite = new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10);

  const query = useQuery({
    queryKey: ["dp_minha_proxima_folga", colaboradorId, hoje],
    enabled: !!colaboradorId,
    queryFn: async () => {
      const [folgasRes, escalaRes, configRes] = await Promise.all([
        supabase
          .from("dp_folgas")
          .select("data, status, tipo")
          .eq("colaborador_id", colaboradorId!)
          .neq("status", "cancelada")
          .gte("data", hoje)
          .lte("data", limite)
          .order("data"),
        supabase
          .from("dp_escala_itens")
          .select("data, tipo")
          .eq("colaborador_id", colaboradorId!)
          .neq("tipo", "trabalho")
          .gte("data", hoje)
          .lte("data", limite)
          .order("data"),
        supabase
          .from("dp_colaborador_config_trabalho")
          .select("id, folga_fixa_dow, dias:dp_colaborador_config_dias(dow, trabalha)")
          .eq("colaborador_id", colaboradorId!)
          .order("vigencia_inicio", { ascending: false })
          .limit(1),
      ]);

      const folgas = (folgasRes.data ?? []) as FolgaLancada[];
      const escala = (escalaRes.data ?? []) as ItemEscalaFolga[];
      const cfg = configRes.data?.[0] as
        | { folga_fixa_dow: number | null; dias?: ConfigDia[] }
        | undefined;
      const configDias: ConfigDia[] = cfg?.dias?.length
        ? cfg.dias
        : cfg?.folga_fixa_dow != null
          ? [{ dow: cfg.folga_fixa_dow, trabalha: false }]
          : [];

      return calcularProximaFolga({ hoje, folgas, escala, configDias });
    },
  });

  return { hoje, folga: query.data ?? null, loading: query.isLoading };
}
