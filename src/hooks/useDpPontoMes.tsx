import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { diasDaCompetencia } from "@/lib/dp/escala-mes";
import { linhaParaItem } from "@/hooks/useDpEscalaMes";
import { resolverPeriodo, type ConvocacaoPrevista, type HorarioPrevisto } from "@/lib/dp/horario-previsto";
import {
  consolidarPeriodo,
  totalizarPeriodo,
  pendenciasDoFechamento,
  calcularFechamento,
  type Marcacao,
  type ResumoColaboradorMes,
} from "@/lib/dp/ponto";

const hojeIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const mesAnterior = (comp: string) => {
  const [ano, mes] = comp.split("-").map(Number);
  const d = new Date(ano, mes - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

/**
 * Consolidação mensal do ponto de todos os colaboradores da empresa,
 * base da visão de equipe e do fechamento em lote (Fase 10).
 */
export function useDpPontoMes(competencia: string, unidadeId?: string | null) {
  const { selectedCompanyId } = useCompanyContext();
  const qc = useQueryClient();

  const datas = useMemo(() => diasDaCompetencia(competencia), [competencia]);
  const inicio = datas[0];
  const fim = datas[datas.length - 1];

  const query = useQuery({
    queryKey: ["dp_ponto_mes", selectedCompanyId, competencia, unidadeId ?? null],
    enabled: !!selectedCompanyId && !!inicio,
    queryFn: async () => {
      let qColab = supabase
        .from("dp_colaboradores")
        .select("id, nome, unidade_id")
        .eq("company_id", selectedCompanyId!)
        .eq("ativo", true)
        .order("nome");
      if (unidadeId) qColab = qColab.eq("unidade_id", unidadeId);
      const { data: colaboradores, error: errC } = await qColab;
      if (errC) throw errC;
      const ids = (colaboradores ?? []).map((c) => c.id);
      if (!ids.length) {
        return { colaboradores: [], itens: [], convocacoes: [], pontos: [], fechamentos: [] };
      }

      const { data: escalas, error: errE } = await supabase
        .from("dp_escalas")
        .select("id")
        .eq("competencia", competencia)
        .eq("status", "publicada");
      if (errE) throw errE;
      const escalaIds = (escalas ?? []).map((e) => e.id);

      const itens = escalaIds.length
        ? await supabase
            .from("dp_escala_itens")
            .select("*")
            .in("escala_id", escalaIds)
            .in("colaborador_id", ids)
            .then(({ data, error }) => {
              if (error) throw error;
              return (data ?? []).map(linhaParaItem);
            })
        : [];

      const [convs, pontos, fechamentos] = await Promise.all([
        supabase
          .from("dp_convocacoes")
          .select(
            "colaborador_id, data, status, turno_id, entrada, saida, intervalo_minutos, termina_no_dia_seguinte, carga_prevista_horas, observacao",
          )
          .in("colaborador_id", ids)
          .gte("data", inicio)
          .lte("data", fim)
          .then(({ data, error }) => {
            if (error) throw error;
            return (data ?? []) as unknown as ConvocacaoPrevista[];
          }),
        supabase
          .from("dp_pontos")
          .select("colaborador_id, data, tipo, registrado_em, origem, observacao")
          .in("colaborador_id", ids)
          .gte("data", inicio)
          .lte("data", fim)
          .order("registrado_em")
          .then(({ data, error }) => {
            if (error) throw error;
            return data ?? [];
          }),
        supabase
          .from("dp_ponto_fechamentos")
          .select("id, colaborador_id, competencia, saldo_acumulado_minutos")
          .in("colaborador_id", ids)
          .in("competencia", [competencia, mesAnterior(competencia)])
          .then(({ data, error }) => {
            if (error) throw error;
            return data ?? [];
          }),
      ]);

      return { colaboradores: colaboradores ?? [], itens, convocacoes: convs, pontos, fechamentos };
    },
  });

  const linhas = useMemo<ResumoColaboradorMes[]>(() => {
    const d = query.data;
    if (!d || !d.colaboradores.length) return [];
    const hoje = hojeIso();

    const previstos = resolverPeriodo({
      datas,
      colaboradores: d.colaboradores.map((c) => ({ id: c.id })),
      itens: d.itens,
      escalaPublicada: true,
      convocacoes: d.convocacoes,
    });

    const previstoPor = new Map<string, Map<string, HorarioPrevisto>>();
    for (const p of previstos) {
      const m = previstoPor.get(p.colaborador_id) ?? new Map<string, HorarioPrevisto>();
      m.set(p.data, p);
      previstoPor.set(p.colaborador_id, m);
    }

    const marcacoesPor = new Map<string, Map<string, Marcacao[]>>();
    for (const r of d.pontos) {
      const m = marcacoesPor.get(r.colaborador_id) ?? new Map<string, Marcacao[]>();
      const lista = m.get(r.data) ?? [];
      lista.push({ tipo: r.tipo, registrado_em: r.registrado_em, origem: r.origem, observacao: r.observacao });
      m.set(r.data, lista);
      marcacoesPor.set(r.colaborador_id, m);
    }

    const anterior = mesAnterior(competencia);

    return d.colaboradores.map((c) => {
      const dias = consolidarPeriodo(
        datas,
        previstoPor.get(c.id) ?? new Map(),
        marcacoesPor.get(c.id) ?? new Map(),
        hoje,
      );
      const totais = totalizarPeriodo(dias);
      const saldoAnteriorMinutos =
        d.fechamentos.find((f) => f.colaborador_id === c.id && f.competencia === anterior)
          ?.saldo_acumulado_minutos ?? 0;
      return {
        colaborador_id: c.id,
        nome: c.nome,
        dias,
        totais,
        pendencias: pendenciasDoFechamento(dias).length,
        fechado: d.fechamentos.some((f) => f.colaborador_id === c.id && f.competencia === competencia),
        saldoAnteriorMinutos,
        saldoAcumuladoMinutos: saldoAnteriorMinutos + totais.saldoMinutos,
      };
    });
  }, [query.data, datas, competencia]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["dp_ponto_mes"] });
    qc.invalidateQueries({ queryKey: ["dp_ponto_fechamento"] });
  };

  const fecharLote = useMutation({
    mutationFn: async (alvos: ResumoColaboradorMes[]) => {
      if (!selectedCompanyId) throw new Error("Selecione uma empresa.");
      const abertos = alvos.filter((l) => !l.fechado);
      if (!abertos.length) return 0;
      const { data: auth } = await supabase.auth.getUser();
      const rows = abertos.map((l) => {
        const calc = calcularFechamento(competencia, l.dias, l.saldoAnteriorMinutos);
        return {
          company_id: selectedCompanyId,
          colaborador_id: l.colaborador_id,
          competencia,
          minutos_trabalhados: calc.minutosTrabalhados,
          minutos_previstos: calc.minutosPrevistos,
          saldo_minutos: calc.saldoMinutos,
          saldo_anterior_minutos: calc.saldoAnteriorMinutos,
          saldo_acumulado_minutos: calc.saldoAcumuladoMinutos,
          faltas: calc.faltas,
          atraso_minutos: calc.atrasoMinutos,
          fechado_por: auth.user?.id ?? null,
        };
      });
      const { error } = await supabase.from("dp_ponto_fechamentos").insert(rows);
      if (error) throw error;
      return rows.length;
    },
    onSuccess: invalidate,
  });

  return { linhas, isLoading: query.isLoading, error: query.error, fecharLote, datas };
}
