import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { diasDaCompetencia } from "@/lib/dp/escala-mes";
import { linhaParaItem } from "@/hooks/useDpEscalaMes";
import {
  resolverPeriodo,
  horasPrevistas,
  proximoTurnoPrevisto,
  type ConvocacaoPrevista,
  type HorarioPrevisto,
} from "@/lib/dp/horario-previsto";

const hojeIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/**
 * Horário previsto do colaborador em uma competência: consolida a escala
 * publicada e as convocações aceitas em uma única linha do tempo.
 */
export function useDpHorarioPrevisto(colaboradorId: string | null, competencia: string) {
  const datas = useMemo(() => diasDaCompetencia(competencia), [competencia]);
  const inicio = datas[0];
  const fim = datas[datas.length - 1];

  const query = useQuery({
    queryKey: ["dp_horario_previsto", colaboradorId, competencia],
    enabled: !!colaboradorId && !!inicio,
    queryFn: async () => {
      const { data: escalas, error: errE } = await supabase
        .from("dp_escalas")
        .select("id")
        .eq("competencia", competencia)
        .eq("status", "publicada");
      if (errE) throw errE;

      const ids = (escalas ?? []).map((e) => e.id);
      const itens = ids.length
        ? await supabase
            .from("dp_escala_itens")
            .select("*")
            .in("escala_id", ids)
            .eq("colaborador_id", colaboradorId!)
            .then(({ data, error }) => {
              if (error) throw error;
              return (data ?? []).map(linhaParaItem);
            })
        : [];

      const { data: convs, error: errC } = await supabase
        .from("dp_convocacoes")
        .select("colaborador_id, data, status, turno_id, entrada, saida, intervalo_minutos, termina_no_dia_seguinte, carga_prevista_horas, observacao")
        .eq("colaborador_id", colaboradorId!)
        .gte("data", inicio)
        .lte("data", fim);
      if (errC) throw errC;

      return { itens, convocacoes: (convs ?? []) as unknown as ConvocacaoPrevista[] };
    },
  });

  const previsto = useMemo<HorarioPrevisto[]>(() => {
    if (!colaboradorId || !query.data) return [];
    return resolverPeriodo({
      datas,
      colaboradores: [{ id: colaboradorId }],
      itens: query.data.itens,
      escalaPublicada: true,
      convocacoes: query.data.convocacoes,
    });
  }, [colaboradorId, datas, query.data]);

  const porData = useMemo(() => new Map(previsto.map((p) => [p.data, p])), [previsto]);

  return {
    previsto,
    porData,
    isLoading: query.isLoading,
    error: query.error,
    horas: horasPrevistas(previsto.filter((p) => p.trabalha)),
    proximo: proximoTurnoPrevisto(previsto, hojeIso()),
    hoje: porData.get(hojeIso()) ?? null,
  };
}
