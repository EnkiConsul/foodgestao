import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { contarDia, somarDias, SEMANAS_BASELINE, type PessoaPanorama } from "@/lib/dp/operacao-panorama";
import { carregarPanorama } from "@/lib/dp/analytics/panorama-input";
import {
  agruparOperacao,
  baselineComAmostras,
  classificarDias,
  resumoExtras,
  resumoSituacao,
  DOW_LABEL,
  type ExtraAnalytics,
} from "@/lib/dp/analytics/operacao";
import { diasDoIntervalo, type PeriodoAnalytics } from "@/lib/dp/analytics/periodo";
import { TODOS, type AnalyticsFiltros } from "@/lib/dp/analytics/filtros";

interface Opts {
  periodo: PeriodoAnalytics;
  filtros: AnalyticsFiltros;
  nomes: { unidade: (id: string | null) => string; cargo: (id: string | null) => string; setor: (id: string | null) => string };
  enabled?: boolean;
}

/** Só quem está de fato na operação do dia entra na contagem comparada. */
const NA_OPERACAO = new Set(["fixo", "convocado_aceito"]);

/**
 * Operação: quadro de cada dia contra o padrão histórico do mesmo dia da semana.
 * Usa o mesmo motor e a mesma tolerância da Rotina — o Analytics só agrega.
 */
export function useAnalyticsOperacao({ periodo, filtros, nomes, enabled = true }: Opts) {
  const { selectedCompanyId } = useCompanyContext();
  const janelaInicio = useMemo(() => somarDias(periodo.inicio, -SEMANAS_BASELINE * 7), [periodo.inicio]);
  const ativo = enabled && !!selectedCompanyId;

  const query = useQuery({
    queryKey: ["dp_analytics_operacao", selectedCompanyId, janelaInicio, periodo.fim],
    enabled: ativo,
    queryFn: () => carregarPanorama(selectedCompanyId!, janelaInicio, periodo.fim),
  });

  return useMemo(() => {
    const dados = query.data;
    const vazio = {
      isLoading: query.isLoading,
      isError: query.isError,
      refetch: query.refetch,
      resumo: { analisados: 0, dentro: 0, abaixo: 0, acima: 0, semHistorico: 0 },
      dias: [] as ReturnType<typeof classificarDias>,
      porDiaSemana: [] as ReturnType<typeof agruparOperacao>,
      porCargo: [] as ReturnType<typeof agruparOperacao>,
      porSetor: [] as ReturnType<typeof agruparOperacao>,
      extras: resumoExtras([], periodo),
      extrasPorUnidade: [] as { label: string; dias: number; utilizacoes: number }[],
    };
    if (!dados) return vazio;

    const colaboradores = dados.colaboradores.filter(
      (c) =>
        (filtros.unidade === TODOS || c.unidade_id === filtros.unidade) &&
        (filtros.cargo === TODOS || c.cargo_id === filtros.cargo) &&
        (filtros.vinculo === TODOS || (c.regime ?? "") === filtros.vinculo),
    );

    const noQuadro = (data: string) =>
      colaboradores.filter(
        (c) =>
          (!c.data_admissao || c.data_admissao <= data) &&
          (!c.data_desligamento || c.data_desligamento >= data) &&
          (c.ativo || !!c.data_desligamento),
      );

    const pessoasDoDia = (data: string): PessoaPanorama[] => {
      const res = contarDia({
        data,
        colaboradores: noQuadro(data),
        turnos: dados.turnos,
        convocacoes: dados.convocacoes,
        folgas: dados.folgas,
        ausencias: dados.ausencias,
        itensPublicados: dados.itens,
        setores: dados.setores,
      });
      // Setor é filtrado pelo setor efetivo do dia, não pelo cadastro: quem foi
      // deslocado conta no setor em que trabalhou naquele dia.
      return res.pessoas.filter(
        (p) =>
          NA_OPERACAO.has(p.categoria) &&
          (filtros.setor === TODOS || (p.setor_id ?? null) === filtros.setor),
      );
    };

    const janela = diasDoIntervalo({ inicio: janelaInicio, fim: periodo.fim }, 800);
    const porData = new Map<string, PessoaPanorama[]>();
    janela.forEach((d) => porData.set(d, pessoasDoDia(d)));

    const serie = janela.map((d) => ({ data: d, pessoas: porData.get(d)?.length ?? 0 }));
    const historico = serie.filter((s) => s.data < periodo.inicio);
    const doPeriodo = serie.filter((s) => s.data >= periodo.inicio && s.data <= periodo.fim);

    const baseline = baselineComAmostras(historico, { limite: periodo.inicio });
    const dias = classificarDias(doPeriodo, baseline);

    /** Recorte por dimensão: mesma metodologia, contando só as pessoas do grupo. */
    const porDimensao = (
      chaveDe: (p: PessoaPanorama) => string | null,
      label: (chave: string | null) => string,
    ) => {
      const chaves = new Set<string>();
      porData.forEach((pessoas) => pessoas.forEach((p) => chaves.add(chaveDe(p) ?? "")));
      return [...chaves]
        .flatMap((chave) => {
          const contar = (lista: readonly { data: string }[]) =>
            lista.map((s) => ({
              data: s.data,
              pessoas: (porData.get(s.data) ?? []).filter((p) => (chaveDe(p) ?? "") === chave).length,
            }));
          const base = baselineComAmostras(contar(historico), { limite: periodo.inicio });
          const classificados = classificarDias(contar(doPeriodo), base);
          return agruparOperacao(classificados, () => chave, () => label(chave || null));
        })
        .sort((a, b) => b.percentualAbaixo - a.percentualAbaixo || b.diasAbaixo - a.diasAbaixo);
    };

    const extras: ExtraAnalytics[] = dados.avulsos.map((a) => ({
      id: a.id,
      tipo: a.tipo,
      colaborador_id: a.colaborador_id,
      unidade_id: a.unidade_id,
      cargo_id: a.cargo_id,
      data_inicio: a.data_inicio,
      data_fim: a.data_fim,
    }));
    const resumoDeExtras = resumoExtras(
      extras.filter((e) => filtros.unidade === TODOS || e.unidade_id === filtros.unidade),
      periodo,
    );

    return {
      isLoading: query.isLoading,
      isError: query.isError,
      refetch: query.refetch,
      resumo: resumoSituacao(dias),
      dias,
      porDiaSemana: agruparOperacao(
        dias,
        (d) => String(d.dow),
        (k) => DOW_LABEL[Number(k)] ?? "Dia",
      ),
      porCargo: porDimensao((p) => p.cargo_id, nomes.cargo),
      porSetor: porDimensao((p) => p.setor_id ?? null, nomes.setor),
      extras: resumoDeExtras,
      extrasPorUnidade: resumoDeExtras.porUnidade.map((u) => ({
        label: nomes.unidade(u.unidade_id),
        dias: u.dias,
        utilizacoes: u.utilizacoes,
      })),
    };
  }, [query.data, query.isLoading, query.isError, query.refetch, filtros, periodo, janelaInicio, nomes]);
}
