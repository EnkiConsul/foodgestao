import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { competenciasDoPeriodo, isoDe, somarDias, type PeriodoAnalytics } from "@/lib/dp/analytics/periodo";
import { distribuir } from "@/lib/dp/analytics/equipe";

interface PeriodoFerias {
  colaborador_id: string;
  limite_concessivo: string | null;
  dias_saldo: number | null;
  status: string;
}

interface GozoFerias {
  colaborador_id: string;
  data_inicio: string;
  data_fim: string;
  status: string;
}

interface Opts {
  periodo: PeriodoAnalytics;
  colabIds: Set<string>;
  dimensao: (id: string) => { unidade_id: string | null; cargo_id: string | null } | undefined;
  nomes: { unidade: (id: string | null) => string; cargo: (id: string | null) => string };
  enabled?: boolean;
}

const GOZO_VALIDO = new Set(["planejado", "aprovado", "em_gozo", "concluido"]);
const GOZO_PROGRAMADO = new Set(["planejado", "aprovado"]);

/** Situação das férias: saldo, prazo, programação e distribuição. Sem valores. */
export function useAnalyticsFerias({ periodo, colabIds, dimensao, nomes, enabled = true }: Opts) {
  const { selectedCompanyId } = useCompanyContext();
  const ativo = enabled && !!selectedCompanyId;
  const hoje = isoDe(new Date());
  const limite30 = somarDias(hoje, 30);

  const query = useQuery({
    queryKey: ["dp_analytics_ferias", selectedCompanyId, periodo.inicio, periodo.fim],
    enabled: ativo,
    queryFn: async () => {
      const [periodos, gozos, solicitacoes] = await Promise.all([
        supabase
          .from("dp_ferias_periodos")
          .select("colaborador_id, limite_concessivo, dias_saldo, status")
          .eq("company_id", selectedCompanyId!),
        supabase
          .from("dp_ferias_gozos")
          .select("colaborador_id, data_inicio, data_fim, status")
          .eq("company_id", selectedCompanyId!)
          .neq("status", "cancelado"),
        supabase
          .from("dp_solicitacoes")
          .select("colaborador_id")
          .eq("company_id", selectedCompanyId!)
          .eq("tipo", "ferias")
          .eq("status", "pendente"),
      ]);
      const err = [periodos, gozos, solicitacoes].find((r) => r.error);
      if (err?.error) throw err.error;
      return {
        periodos: (periodos.data ?? []) as PeriodoFerias[],
        gozos: (gozos.data ?? []) as GozoFerias[],
        pendentes: (solicitacoes.data ?? []) as { colaborador_id: string }[],
      };
    },
  });

  const dados = query.data;

  return useMemo(() => {
    const periodos = (dados?.periodos ?? []).filter((p) => colabIds.has(p.colaborador_id));
    const gozos = (dados?.gozos ?? []).filter(
      (g) => colabIds.has(g.colaborador_id) && GOZO_VALIDO.has(g.status),
    );
    const pendentes = (dados?.pendentes ?? []).filter((s) => colabIds.has(s.colaborador_id));

    const comSaldo = periodos.filter((p) => (p.dias_saldo ?? 0) > 0 && p.status !== "concluido");
    const programadosPor = new Set(
      gozos.filter((g) => GOZO_PROGRAMADO.has(g.status) && g.data_fim >= hoje).map((g) => g.colaborador_id),
    );

    const vencidos = comSaldo.filter((p) => !!p.limite_concessivo && p.limite_concessivo < hoje);
    const vencendo = comSaldo.filter(
      (p) => !!p.limite_concessivo && p.limite_concessivo >= hoje && p.limite_concessivo <= limite30,
    );
    const aProgramar = comSaldo.filter((p) => !programadosPor.has(p.colaborador_id));

    const programados = gozos.filter((g) => GOZO_PROGRAMADO.has(g.status) && g.data_fim >= hoje);
    const emFeriasHoje = gozos.filter((g) => g.data_inicio <= hoje && g.data_fim >= hoje);

    const noPeriodo = gozos.filter((g) => g.data_inicio <= periodo.fim && g.data_fim >= periodo.inicio);
    const porMes = competenciasDoPeriodo(periodo).map((comp) => {
      const ini = `${comp}-01`;
      const fim = `${comp}-31`;
      const doMes = noPeriodo.filter((g) => g.data_inicio <= fim && g.data_fim >= ini);
      return {
        competencia: comp,
        label: `${comp.slice(5, 7)}/${comp.slice(2, 4)}`,
        pessoas: new Set(doMes.map((g) => g.colaborador_id)).size,
        periodos: doMes.length,
      };
    });

    return {
      isLoading: query.isLoading,
      isError: query.isError,
      refetch: query.refetch,
      kpis: {
        periodosComSaldo: comSaldo.length,
        aProgramar: aProgramar.length,
        vencendoEm30Dias: vencendo.length,
        vencidos: vencidos.length,
        pessoasProgramadas: new Set(programados.map((g) => g.colaborador_id)).size,
        periodosProgramados: programados.length,
        emFeriasHoje: new Set(emFeriasHoje.map((g) => g.colaborador_id)).size,
        solicitacoesPendentes: pendentes.length,
      },
      porMes,
      porUnidade: distribuir(
        noPeriodo,
        (g) => dimensao(g.colaborador_id)?.unidade_id ?? null,
        (k) => nomes.unidade(k),
      ),
      porCargo: distribuir(
        noPeriodo,
        (g) => dimensao(g.colaborador_id)?.cargo_id ?? null,
        (k) => nomes.cargo(k),
      ),
      /** Dias com pelo menos uma pessoa de férias no período (para cruzar com a operação). */
      diasComFerias: new Set(
        noPeriodo.flatMap((g) => {
          const out: string[] = [];
          let cur = g.data_inicio < periodo.inicio ? periodo.inicio : g.data_inicio;
          const fim = g.data_fim > periodo.fim ? periodo.fim : g.data_fim;
          while (cur <= fim) {
            out.push(cur);
            cur = somarDias(cur, 1);
          }
          return out;
        }),
      ),
    };
  }, [dados, colabIds, periodo, hoje, limite30, dimensao, nomes, query.isLoading, query.isError, query.refetch]);
}
