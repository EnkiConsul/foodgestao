import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { competenciasDoPeriodo, periodoAnterior, type PeriodoAnalytics } from "@/lib/dp/analytics/periodo";

interface ConvocacaoRow {
  colaborador_id: string;
  unidade_id: string | null;
  data: string;
  status: string;
  enviada_em: string | null;
  respondida_em: string | null;
}

interface Opts {
  periodo: PeriodoAnalytics;
  colabIds: Set<string>;
  dimensao: (id: string) => { unidade_id: string | null; cargo_id: string | null } | undefined;
  nomes: { unidade: (id: string | null) => string; cargo: (id: string | null) => string };
  enabled?: boolean;
}

const RESPONDIDAS = new Set(["aceita", "recusada"]);

/** Taxa de aceite considera só convocações que chegaram ao colaborador. */
function taxaAceite(lista: readonly ConvocacaoRow[]): number | null {
  const enviadas = lista.filter((c) => c.status !== "cancelada");
  if (!enviadas.length) return null;
  const aceitas = enviadas.filter((c) => c.status === "aceita").length;
  return Math.round((aceitas / enviadas.length) * 100);
}

export function useAnalyticsConvocacoes({ periodo, colabIds, dimensao, nomes, enabled = true }: Opts) {
  const { selectedCompanyId } = useCompanyContext();
  const anterior = useMemo(() => periodoAnterior(periodo), [periodo]);
  const ativo = enabled && !!selectedCompanyId;

  const query = useQuery({
    queryKey: ["dp_analytics_convocacoes", selectedCompanyId, anterior.inicio, periodo.fim],
    enabled: ativo,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dp_convocacoes")
        .select("colaborador_id, unidade_id, data, status, enviada_em, respondida_em")
        .eq("company_id", selectedCompanyId!)
        .gte("data", anterior.inicio)
        .lte("data", periodo.fim);
      if (error) throw error;
      return (data ?? []) as ConvocacaoRow[];
    },
  });

  return useMemo(() => {
    const todas = (query.data ?? []).filter((c) => colabIds.has(c.colaborador_id));
    const noPeriodo = todas.filter((c) => c.data >= periodo.inicio && c.data <= periodo.fim);
    const noAnterior = todas.filter((c) => c.data >= anterior.inicio && c.data <= anterior.fim);

    const conta = (status: string) => noPeriodo.filter((c) => c.status === status).length;
    const horas = noPeriodo
      .filter((c) => !!c.respondida_em && !!c.enviada_em)
      .map(
        (c) => (new Date(c.respondida_em!).getTime() - new Date(c.enviada_em!).getTime()) / 3_600_000,
      )
      .filter((h) => h >= 0);

    const agrupar = (chaveDe: (c: ConvocacaoRow) => string | null, label: (k: string | null) => string) => {
      const mapa = new Map<string, ConvocacaoRow[]>();
      noPeriodo.forEach((c) => {
        const k = chaveDe(c) ?? "";
        mapa.set(k, [...(mapa.get(k) ?? []), c]);
      });
      return [...mapa.entries()]
        .map(([k, lista]) => ({
          chave: k || null,
          label: label(k || null),
          enviadas: lista.filter((c) => c.status !== "cancelada").length,
          aceitas: lista.filter((c) => c.status === "aceita").length,
          aceite: taxaAceite(lista),
        }))
        .sort((a, b) => b.enviadas - a.enviadas);
    };

    return {
      isLoading: query.isLoading,
      isError: query.isError,
      refetch: query.refetch,
      kpis: {
        enviadas: noPeriodo.filter((c) => c.status !== "cancelada").length,
        aceitas: conta("aceita"),
        recusadas: conta("recusada"),
        semResposta: noPeriodo.filter(
          (c) => c.status === "sem_resposta" || c.status === "expirada" || c.status === "pendente",
        ).length,
        respondidas: noPeriodo.filter((c) => RESPONDIDAS.has(c.status)).length,
        aceite: taxaAceite(noPeriodo),
        aceiteAnterior: taxaAceite(noAnterior),
        mediaHorasResposta: horas.length
          ? Number((horas.reduce((s, h) => s + h, 0) / horas.length).toFixed(1))
          : null,
      },
      porUnidade: agrupar((c) => c.unidade_id ?? dimensao(c.colaborador_id)?.unidade_id ?? null, nomes.unidade),
      porCargo: agrupar((c) => dimensao(c.colaborador_id)?.cargo_id ?? null, nomes.cargo),
      porMes: competenciasDoPeriodo(periodo).map((comp) => {
        const doMes = noPeriodo.filter((c) => c.data.slice(0, 7) === comp);
        return {
          competencia: comp,
          label: `${comp.slice(5, 7)}/${comp.slice(2, 4)}`,
          enviadas: doMes.filter((c) => c.status !== "cancelada").length,
          aceite: taxaAceite(doMes),
        };
      }),
    };
  }, [query.data, query.isLoading, query.isError, query.refetch, colabIds, periodo, anterior, dimensao, nomes]);
}
