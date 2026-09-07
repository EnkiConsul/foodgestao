import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import {
  atestadosDoPeriodo,
  diasDeAfastamento,
  resumoAtestados,
  resumoFolgas,
  resumoOcorrencias,
  resumoSolicitacoes,
  type AtestadoAnalytics,
  type FolgaAnalytics,
  type OcorrenciaAnalytics,
  type SolicitacaoAnalytics,
} from "@/lib/dp/analytics/ausencias";
import { diasNaInterseccao, periodoAnterior, type PeriodoAnalytics } from "@/lib/dp/analytics/periodo";
import { distribuir } from "@/lib/dp/analytics/equipe";

interface Opts {
  periodo: PeriodoAnalytics;
  colabIds: Set<string>;
  /** Rótulos e dimensões do cadastro. */
  dimensao: (id: string) => { unidade_id: string | null; cargo_id: string | null; setor_id: string | null } | undefined;
  nomes: {
    unidade: (id: string | null) => string;
    cargo: (id: string | null) => string;
    setor: (id: string | null) => string;
  };
  enabled?: boolean;
}

/**
 * Atestados, folgas, solicitações, ocorrências e registros disciplinares —
 * cada domínio separado, nunca somados entre si.
 * O bloco disciplinar simplesmente não aparece quando a leitura é negada.
 */
export function useAnalyticsAusencias({ periodo, colabIds, dimensao, nomes, enabled = true }: Opts) {
  const { selectedCompanyId } = useCompanyContext();
  const anterior = useMemo(() => periodoAnterior(periodo), [periodo]);
  const ativo = enabled && !!selectedCompanyId;

  const query = useQuery({
    queryKey: ["dp_analytics_ausencias", selectedCompanyId, anterior.inicio, periodo.fim],
    enabled: ativo,
    queryFn: async () => {
      const [atestados, folgas, solicitacoes, ocorrencias] = await Promise.all([
        supabase
          .from("dp_solicitacoes")
          .select("colaborador_id, data_alvo, data_fim")
          .eq("company_id", selectedCompanyId!)
          .eq("tipo", "atestado")
          .eq("status", "aprovada")
          .not("data_alvo", "is", null)
          .lte("data_alvo", periodo.fim)
          .or(`data_fim.gte.${anterior.inicio},and(data_fim.is.null,data_alvo.gte.${anterior.inicio})`),
        supabase
          .from("dp_folgas")
          .select("colaborador_id, data, tipo, origem, status, extra")
          .eq("company_id", selectedCompanyId!)
          .neq("status", "cancelada")
          .gte("data", anterior.inicio)
          .lte("data", periodo.fim),
        supabase
          .from("dp_solicitacoes")
          .select("colaborador_id, tipo, status, created_at, respondido_em")
          .eq("company_id", selectedCompanyId!)
          .gte("created_at", `${anterior.inicio}T00:00:00`)
          .lte("created_at", `${periodo.fim}T23:59:59`),
        supabase
          .from("dp_ocorrencias")
          .select("colaborador_id, tipo, estado, data_operacional, unidade_id, setor_id")
          .eq("company_id", selectedCompanyId!)
          .gte("data_operacional", anterior.inicio)
          .lte("data_operacional", periodo.fim),
      ]);
      const err = [atestados, folgas, solicitacoes, ocorrencias].find((r) => r.error);
      if (err?.error) throw err.error;
      return {
        atestados: (atestados.data ?? []) as AtestadoAnalytics[],
        folgas: (folgas.data ?? []) as FolgaAnalytics[],
        solicitacoes: (solicitacoes.data ?? []) as SolicitacaoAnalytics[],
        ocorrencias: (ocorrencias.data ?? []) as OcorrenciaAnalytics[],
      };
    },
  });

  // Registros disciplinares vivem em domínio próprio e podem ser negados pela
  // política de acesso: se a leitura falhar, o bloco não é exibido (fail closed).
  const disciplinar = useQuery({
    queryKey: ["dp_analytics_disciplinar", selectedCompanyId, periodo.inicio, periodo.fim],
    enabled: ativo,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dp_registros_disciplinares")
        .select("colaborador_id, tipo, data")
        .eq("company_id", selectedCompanyId!)
        .gte("data", periodo.inicio)
        .lte("data", periodo.fim);
      if (error) throw error;
      return (data ?? []) as { colaborador_id: string; tipo: string; data: string }[];
    },
  });

  const meus = <T extends { colaborador_id: string }>(lista: readonly T[]) =>
    lista.filter((r) => colabIds.has(r.colaborador_id));

  const dados = query.data;

  const atestados = useMemo(() => meus(dados?.atestados ?? []), [dados, colabIds]);
  const folgas = useMemo(() => meus(dados?.folgas ?? []), [dados, colabIds]);
  const solicitacoes = useMemo(() => meus(dados?.solicitacoes ?? []), [dados, colabIds]);
  const ocorrencias = useMemo(() => meus(dados?.ocorrencias ?? []), [dados, colabIds]);
  const registros = useMemo(
    () => (disciplinar.isError ? [] : meus(disciplinar.data ?? [])),
    [disciplinar.data, disciplinar.isError, colabIds],
  );

  const doPeriodo = useMemo(() => atestadosDoPeriodo(atestados, periodo), [atestados, periodo]);

  const porDimensaoAtestado = (dim: "unidade_id" | "cargo_id" | "setor_id") => {
    const mapa = new Map<string, number>();
    doPeriodo.forEach((a) => {
      const d = dimensao(a.colaborador_id);
      const k = (d?.[dim] ?? "") as string;
      mapa.set(k, (mapa.get(k) ?? 0) + diasNaInterseccao({ inicio: a.data_alvo, fim: a.data_fim }, periodo));
    });
    const nomeDe = dim === "unidade_id" ? nomes.unidade : dim === "cargo_id" ? nomes.cargo : nomes.setor;
    return [...mapa.entries()]
      .map(([k, dias]) => ({ chave: k || null, label: nomeDe(k || null), dias }))
      .sort((a, b) => b.dias - a.dias);
  };

  return {
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
    atestados: resumoAtestados(atestados, periodo),
    atestadosAnterior: resumoAtestados(atestados, anterior),
    diasAfastamento: diasDeAfastamento(atestados, periodo),
    diasAfastamentoAnterior: diasDeAfastamento(atestados, anterior),
    atestadoPorUnidade: porDimensaoAtestado("unidade_id"),
    atestadoPorCargo: porDimensaoAtestado("cargo_id"),
    atestadoPorSetor: porDimensaoAtestado("setor_id"),
    folgas: resumoFolgas(folgas, periodo),
    solicitacoes: resumoSolicitacoes(solicitacoes, periodo),
    ocorrencias: resumoOcorrencias(ocorrencias, periodo),
    ocorrenciasAnterior: resumoOcorrencias(ocorrencias, anterior),
    ocorrenciaPorUnidade: distribuir(
      ocorrencias.filter(
        (o) => o.estado === "confirmada" && o.data_operacional >= periodo.inicio && o.data_operacional <= periodo.fim,
      ),
      (o) => o.unidade_id ?? dimensao(o.colaborador_id)?.unidade_id ?? null,
      (k) => nomes.unidade(k),
    ),
    disciplinarDisponivel: !disciplinar.isError,
    disciplinarPorTipo: distribuir(registros, (r) => r.tipo, (k) => k ?? "Não informado"),
    disciplinarTotal: registros.length,
  };
}
