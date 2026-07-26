import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  addMonths, differenceInCalendarDays, endOfMonth, format, parseISO, startOfMonth,
} from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";

export type AnalyticsRange = { inicio: string; fim: string };

export type MesSerie = {
  competencia: string;   // yyyy-MM
  label: string;         // MM/yy
  headcount: number;     // ativos no fim do mês
  admissoes: number;
  desligamentos: number;
  turnover: number;      // %
  custo: number;         // folha líquida do mês
};

export type UnidadeResumo = {
  unidade_id: string | null;
  nome: string;
  headcount: number;
  desligamentos: number;
  custo: number;
  folgas: number;
  atestados: number;
};

type ColabRow = {
  id: string;
  nome: string;
  unidade_id: string | null;
  data_admissao: string | null;
  data_desligamento: string | null;
  motivo_desligamento: string | null;
  ativo: boolean;
};

const iso = (d: Date) => format(d, "yyyy-MM-dd");

/** Lista de competências (yyyy-MM) dentro do intervalo. */
function mesesDoIntervalo(inicio: string, fim: string) {
  const out: Date[] = [];
  let cur = startOfMonth(parseISO(inicio));
  const last = startOfMonth(parseISO(fim));
  while (cur <= last && out.length < 36) {
    out.push(cur);
    cur = addMonths(cur, 1);
  }
  return out;
}

const ativoEm = (c: ColabRow, ref: Date) => {
  const adm = c.data_admissao ? parseISO(c.data_admissao) : null;
  if (adm && adm > ref) return false;
  const des = c.data_desligamento ? parseISO(c.data_desligamento) : null;
  if (des && des < ref) return false;
  return true;
};

/**
 * Indicadores estratégicos de RH: headcount, turnover, absenteísmo,
 * custo de folha e distribuição de folgas — agregados por mês e por unidade.
 */
export function useDpAnalytics(range: AnalyticsRange, unidadeFilter = "todas") {
  const { selectedCompanyId } = useCompanyContext();
  const enabled = !!selectedCompanyId;

  const colaboradoresQ = useQuery({
    queryKey: ["dp_analytics_colaboradores", selectedCompanyId],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dp_colaboradores")
        .select("id, nome, unidade_id, data_admissao, data_desligamento, motivo_desligamento, ativo")
        .eq("company_id", selectedCompanyId!);
      if (error) throw error;
      return (data ?? []) as ColabRow[];
    },
  });

  const unidadesQ = useQuery({
    queryKey: ["dp_analytics_unidades", selectedCompanyId],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dp_unidades")
        .select("id, nome")
        .eq("company_id", selectedCompanyId!)
        .order("nome");
      if (error) throw error;
      return (data ?? []) as { id: string; nome: string }[];
    },
  });

  const folgasQ = useQuery({
    queryKey: ["dp_analytics_folgas", selectedCompanyId, range.inicio, range.fim],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dp_folgas")
        .select("colaborador_id, data, tipo, status")
        .eq("company_id", selectedCompanyId!)
        .neq("status", "cancelada")
        .gte("data", range.inicio)
        .lte("data", range.fim);
      if (error) throw error;
      return (data ?? []) as { colaborador_id: string; data: string; tipo: string; status: string }[];
    },
  });

  const atestadosQ = useQuery({
    queryKey: ["dp_analytics_atestados", selectedCompanyId, range.inicio, range.fim],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dp_solicitacoes")
        .select("colaborador_id, tipo, status, data_alvo, data_fim, created_at")
        .eq("company_id", selectedCompanyId!)
        .eq("tipo", "atestado")
        .gte("created_at", `${range.inicio}T00:00:00`)
        .lte("created_at", `${range.fim}T23:59:59`);
      if (error) throw error;
      return (data ?? []) as {
        colaborador_id: string; tipo: string; status: string;
        data_alvo: string | null; data_fim: string | null; created_at: string;
      }[];
    },
  });

  const folhaQ = useQuery({
    queryKey: ["dp_analytics_folha", selectedCompanyId, range.inicio, range.fim],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dp_folha_lancamentos")
        .select("colaborador_id, valor_liquido, status, dp_folha_periodos!inner(competencia)")
        .eq("company_id", selectedCompanyId!)
        .neq("status", "cancelado")
        .gte("dp_folha_periodos.competencia", startOfMonth(parseISO(range.inicio)).toISOString().slice(0, 10))
        .lte("dp_folha_periodos.competencia", endOfMonth(parseISO(range.fim)).toISOString().slice(0, 10));
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        colaborador_id: r.colaborador_id as string,
        valor: Number(r.valor_liquido ?? 0),
        competencia: String(r.dp_folha_periodos?.competencia ?? "").slice(0, 7),
      }));
    },
  });

  const isLoading =
    colaboradoresQ.isLoading || unidadesQ.isLoading || folgasQ.isLoading ||
    atestadosQ.isLoading || folhaQ.isLoading;
  const isError =
    colaboradoresQ.isError || unidadesQ.isError || folgasQ.isError ||
    atestadosQ.isError || folhaQ.isError;
  const refetchAll = () => {
    colaboradoresQ.refetch();
    unidadesQ.refetch();
    folgasQ.refetch();
    atestadosQ.refetch();
    folhaQ.refetch();
  };

  const unidades = unidadesQ.data ?? [];
  const nomeUnidade = (id: string | null) =>
    unidades.find((u) => u.id === id)?.nome ?? "Sem unidade";

  const colaboradores = useMemo(() => {
    const all = colaboradoresQ.data ?? [];
    return unidadeFilter === "todas" ? all : all.filter((c) => c.unidade_id === unidadeFilter);
  }, [colaboradoresQ.data, unidadeFilter]);

  const colabIds = useMemo(() => new Set(colaboradores.map((c) => c.id)), [colaboradores]);
  const folgas = (folgasQ.data ?? []).filter((f) => colabIds.has(f.colaborador_id));
  const atestados = (atestadosQ.data ?? []).filter((a) => colabIds.has(a.colaborador_id));
  const folha = (folhaQ.data ?? []).filter((l) => colabIds.has(l.colaborador_id));

  const serie: MesSerie[] = useMemo(() => {
    return mesesDoIntervalo(range.inicio, range.fim).map((mes) => {
      const ini = startOfMonth(mes);
      const fim = endOfMonth(mes);
      const comp = format(mes, "yyyy-MM");

      const inicioAtivos = colaboradores.filter((c) => ativoEm(c, ini)).length;
      const fimAtivos = colaboradores.filter((c) => ativoEm(c, fim)).length;
      const admissoes = colaboradores.filter(
        (c) => c.data_admissao && c.data_admissao >= iso(ini) && c.data_admissao <= iso(fim),
      ).length;
      const desligamentos = colaboradores.filter(
        (c) => c.data_desligamento && c.data_desligamento >= iso(ini) && c.data_desligamento <= iso(fim),
      ).length;

      const medio = (inicioAtivos + fimAtivos) / 2;
      const turnover = medio > 0 ? ((admissoes + desligamentos) / 2 / medio) * 100 : 0;
      const custo = folha.filter((l) => l.competencia === comp).reduce((s, l) => s + l.valor, 0);

      return {
        competencia: comp,
        label: format(mes, "MM/yy"),
        headcount: fimAtivos,
        admissoes,
        desligamentos,
        turnover: Number(turnover.toFixed(1)),
        custo,
      };
    });
  }, [colaboradores, folha, range.inicio, range.fim]);

  /** Dias de afastamento por atestado (data_alvo → data_fim, mínimo 1 dia). */
  const diasAtestado = useMemo(
    () =>
      atestados.reduce((soma, a) => {
        if (!a.data_alvo) return soma + 1;
        const ini = parseISO(a.data_alvo);
        const fim = a.data_fim ? parseISO(a.data_fim) : ini;
        return soma + Math.max(1, differenceInCalendarDays(fim, ini) + 1);
      }, 0),
    [atestados],
  );

  const porUnidade: UnidadeResumo[] = useMemo(() => {
    const mapa = new Map<string, UnidadeResumo>();
    const ref = parseISO(range.fim);
    const get = (id: string | null) => {
      const key = id ?? "sem";
      if (!mapa.has(key)) {
        mapa.set(key, {
          unidade_id: id, nome: nomeUnidade(id),
          headcount: 0, desligamentos: 0, custo: 0, folgas: 0, atestados: 0,
        });
      }
      return mapa.get(key)!;
    };
    const unidadeDoColab = new Map(colaboradores.map((c) => [c.id, c.unidade_id]));

    colaboradores.forEach((c) => {
      const linha = get(c.unidade_id);
      if (ativoEm(c, ref)) linha.headcount += 1;
      if (c.data_desligamento && c.data_desligamento >= range.inicio && c.data_desligamento <= range.fim) {
        linha.desligamentos += 1;
      }
    });
    folha.forEach((l) => { get(unidadeDoColab.get(l.colaborador_id) ?? null).custo += l.valor; });
    folgas.forEach((f) => { get(unidadeDoColab.get(f.colaborador_id) ?? null).folgas += 1; });
    atestados.forEach((a) => { get(unidadeDoColab.get(a.colaborador_id) ?? null).atestados += 1; });

    return [...mapa.values()].sort((a, b) => b.headcount - a.headcount);
  }, [colaboradores, folha, folgas, atestados, range.inicio, range.fim, unidades]);

  const motivos = useMemo(() => {
    const mapa = new Map<string, number>();
    colaboradores
      .filter((c) => c.data_desligamento && c.data_desligamento >= range.inicio && c.data_desligamento <= range.fim)
      .forEach((c) => {
        const k = c.motivo_desligamento ?? "outro";
        mapa.set(k, (mapa.get(k) ?? 0) + 1);
      });
    return [...mapa.entries()].map(([motivo, total]) => ({ motivo, total }))
      .sort((a, b) => b.total - a.total);
  }, [colaboradores, range.inicio, range.fim]);

  const headcountAtual = colaboradores.filter((c) => ativoEm(c, parseISO(range.fim))).length;
  const totalDesligamentos = serie.reduce((s, m) => s + m.desligamentos, 0);
  const totalAdmissoes = serie.reduce((s, m) => s + m.admissoes, 0);
  const custoTotal = serie.reduce((s, m) => s + m.custo, 0);
  const turnoverMedio = serie.length
    ? Number((serie.reduce((s, m) => s + m.turnover, 0) / serie.length).toFixed(1))
    : 0;
  const diasUteisPeriodo = Math.max(
    1,
    differenceInCalendarDays(parseISO(range.fim), parseISO(range.inicio)) + 1,
  );
  const absenteismo = headcountAtual > 0
    ? Number(((diasAtestado / (headcountAtual * diasUteisPeriodo)) * 100).toFixed(2))
    : 0;

  return {
    isLoading,
    isError,
    refetchAll,
    unidades,
    serie,
    porUnidade,
    motivos,
    kpis: {
      headcountAtual,
      totalAdmissoes,
      totalDesligamentos,
      turnoverMedio,
      absenteismo,
      diasAtestado,
      custoTotal,
      custoMedioColaborador: headcountAtual > 0 ? custoTotal / headcountAtual : 0,
      totalFolgas: folgas.length,
    },
  };
}
