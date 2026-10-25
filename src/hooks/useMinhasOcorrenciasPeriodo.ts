import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { lerMinhasOcorrencias } from "@/lib/dp/minhas-ocorrencias";

export function useMinhasOcorrenciasPeriodo(inicio: string, fim: string, enabled = true) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["minhas_ocorrencias_periodo", user?.id, inicio, fim],
    enabled: !!user?.id && enabled,
    queryFn: () => lerMinhasOcorrencias(inicio, fim),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
}