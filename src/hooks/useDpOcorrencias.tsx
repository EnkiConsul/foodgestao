import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import {
  TIPOS_COBRIVEIS,
  textoErroOcorrencia,
  type OcorrenciaAnalise,
  type OcorrenciaCoberturaExecucao,
  type OcorrenciaCoberturaStatus,
  type OcorrenciaEstado,
  type OcorrenciaImpacto,
  type OcorrenciaMarcacao,
  type OcorrenciaOrigem,
  type OcorrenciaTipo,
  type OcorrenciaTratativa,
} from "@/lib/dp/ocorrencias";

export interface OcorrenciaCobertura {
  id: string;
  ocorrencia_id: string;
  substituto_colaborador_id: string | null;
  mao_de_obra_extra_id: string | null;
  entrada: string | null;
  saida: string | null;
  status: OcorrenciaCoberturaStatus;
  execucao_status: OcorrenciaCoberturaExecucao;
  motivo_recusa: string | null;
  created_at: string;
  substituto: { nome: string } | null;
  apoio: { nome: string; telefone: string | null } | null;
}


export type OcorrenciaPeriodo = "hoje" | "semana" | "mes" | "todas";

export interface OcorrenciaFiltros {
  periodo: OcorrenciaPeriodo;
  colaboradorId: string;
  unidadeId: string;
  setorId: string;
  tipo: string;
  estado: string;
  analise: string;
  impactaAssiduidade: string;
  impactaFerias: string;
  tratativa: string;
  somentePendentes: boolean;
  cobertura: string;

  busca: string;
}

export const FILTROS_PADRAO: OcorrenciaFiltros = {
  periodo: "semana",
  colaboradorId: "all",
  unidadeId: "all",
  setorId: "all",
  tipo: "all",
  estado: "all",
  analise: "all",
  impactaAssiduidade: "all",
  impactaFerias: "all",
  tratativa: "all",
  somentePendentes: true,
  cobertura: "all",

  busca: "",
};

export interface Ocorrencia {
  id: string;
  colaborador_id: string;
  unidade_id: string | null;
  setor_id: string | null;
  data_operacional: string;
  tipo: OcorrenciaTipo;
  estado: OcorrenciaEstado;
  origem: OcorrenciaOrigem;
  previsto_entrada: string | null;
  previsto_saida: string | null;
  horario_previsto: string | null;
  horario_estimado: string | null;
  horario_real: string | null;
  minutos: number | null;
  justificativa_inicial: string | null;
  justificativa_final: string | null;
  impacta_assiduidade: OcorrenciaImpacto;
  impacta_ferias: OcorrenciaImpacto;
  relevancia_operacional: boolean;
  analise_status: OcorrenciaAnalise;
  analisado_em: string | null;
  tratativa_ponto: boolean;
  tratativa_status: OcorrenciaTratativa;
  tratativa_decisao: string | null;
  tratativa_observacao: string | null;
  marcacao_alvo: OcorrenciaMarcacao | null;
  documento_id: string | null;
  informada_em: string;
  antecedencia_minutos: number | null;
  motivo_cancelamento: string | null;
  created_at: string;
  colaborador: { nome: string; cargo: string | null } | null;
  unidade: { nome: string } | null;
  setor: { nome: string } | null;
}

const COLS = `
  id, colaborador_id, unidade_id, setor_id, data_operacional, tipo, estado, origem,
  previsto_entrada, previsto_saida, horario_previsto, horario_estimado, horario_real, minutos,
  justificativa_inicial, justificativa_final, impacta_assiduidade, impacta_ferias,
  relevancia_operacional, analise_status, analisado_em, tratativa_ponto, tratativa_status,
  tratativa_decisao, tratativa_observacao, marcacao_alvo, documento_id, informada_em,
  antecedencia_minutos, motivo_cancelamento, created_at,
  colaborador:dp_colaboradores!dp_ocorrencias_colaborador_id_fkey(nome, cargo),
  unidade:dp_unidades!dp_ocorrencias_unidade_id_fkey(nome),
  setor:dp_setores!dp_ocorrencias_setor_id_fkey(nome)
`;

function intervaloDe(periodo: OcorrenciaPeriodo): { inicio?: string; fim?: string } {
  if (periodo === "todas") return {};
  const hoje = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  if (periodo === "hoje") return { inicio: iso(hoje), fim: iso(hoje) };
  if (periodo === "semana") {
    const inicio = new Date(hoje);
    inicio.setDate(inicio.getDate() - inicio.getDay());
    const fim = new Date(inicio);
    fim.setDate(fim.getDate() + 6);
    return { inicio: iso(inicio), fim: iso(fim) };
  }
  const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  const fim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
  return { inicio: iso(inicio), fim: iso(fim) };
}

export interface RegistrarOcorrenciaInput {
  colaboradorId: string;
  data: string;
  tipo: OcorrenciaTipo;
  justificativa?: string | null;
  horarioEstimado?: string | null;
  horarioReal?: string | null;
  marcacaoAlvo?: OcorrenciaMarcacao | null;
}

export function useDpOcorrencias(filtros: OcorrenciaFiltros) {
  const { selectedCompanyId } = useCompanyContext();
  const qc = useQueryClient();
  const { inicio, fim } = useMemo(() => intervaloDe(filtros.periodo), [filtros.periodo]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["dp_ocorrencias"] });
    qc.invalidateQueries({ queryKey: ["dp_operacao_panorama"] });
  };

  const lista = useQuery({
    queryKey: ["dp_ocorrencias", selectedCompanyId, filtros],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      let q = supabase
        .from("dp_ocorrencias")
        .select(COLS)
        .eq("company_id", selectedCompanyId!)
        .order("data_operacional", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(500);
      if (inicio) q = q.gte("data_operacional", inicio);
      if (fim) q = q.lte("data_operacional", fim);
      if (filtros.colaboradorId !== "all") q = q.eq("colaborador_id", filtros.colaboradorId);
      if (filtros.unidadeId !== "all") q = q.eq("unidade_id", filtros.unidadeId);
      if (filtros.setorId !== "all") q = q.eq("setor_id", filtros.setorId);
      if (filtros.tipo !== "all") q = q.eq("tipo", filtros.tipo as OcorrenciaTipo);
      if (filtros.estado !== "all") q = q.eq("estado", filtros.estado as OcorrenciaEstado);
      if (filtros.analise !== "all") q = q.eq("analise_status", filtros.analise as OcorrenciaAnalise);
      if (filtros.impactaAssiduidade !== "all")
        q = q.eq("impacta_assiduidade", filtros.impactaAssiduidade as OcorrenciaImpacto);
      if (filtros.impactaFerias !== "all")
        q = q.eq("impacta_ferias", filtros.impactaFerias as OcorrenciaImpacto);
      if (filtros.tratativa !== "all")
        q = q.eq("tratativa_status", filtros.tratativa as OcorrenciaTratativa);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as Ocorrencia[];
    },
  });

  const ids = useMemo(() => (lista.data ?? []).map((o) => o.id), [lista.data]);

  const coberturasQuery = useQuery({
    queryKey: ["dp_ocorrencia_coberturas", selectedCompanyId, ids],
    enabled: !!selectedCompanyId && ids.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dp_ocorrencia_coberturas")
        .select(
          `id, ocorrencia_id, substituto_colaborador_id, mao_de_obra_extra_id, entrada, saida,
           status, execucao_status, motivo_recusa, created_at,
           substituto:dp_colaboradores!dp_ocorrencia_coberturas_substituto_colaborador_id_fkey(nome),
           apoio:dp_pessoas_apoio!dp_ocorrencia_coberturas_mao_de_obra_extra_id_fkey(nome, telefone)`,
        )
        .eq("company_id", selectedCompanyId!)
        .in("ocorrencia_id", ids)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as OcorrenciaCobertura[];
    },
  });

  const coberturasPorOcorrencia = useMemo(() => {
    const mapa = new Map<string, OcorrenciaCobertura[]>();
    for (const c of coberturasQuery.data ?? []) {
      const atual = mapa.get(c.ocorrencia_id) ?? [];
      atual.push(c);
      mapa.set(c.ocorrencia_id, atual);
    }
    return mapa;
  }, [coberturasQuery.data]);

  const ocorrencias = useMemo(() => {
    const todas = lista.data ?? [];
    const termo = filtros.busca.trim().toLowerCase();
    return todas.filter((o) => {
      if (filtros.somentePendentes) {
        const pendente =
          o.estado === "aguardando_confirmacao" ||
          o.analise_status === "pendente" ||
          o.tratativa_status === "pendente" ||
          o.impacta_assiduidade === "aguardando" ||
          o.impacta_ferias === "aguardando";
        if (!pendente || o.estado === "cancelada") return false;
      }
      if (filtros.cobertura !== "all") {
        const lista = (coberturasPorOcorrencia.get(o.id) ?? []).filter((c) => c.status !== "recusada");
        const cobrivel = TIPOS_COBRIVEIS.includes(o.tipo);
        if (filtros.cobertura === "sem" && (!cobrivel || lista.length > 0)) return false;
        if (filtros.cobertura === "proposta" && !lista.some((c) => c.status === "proposta")) return false;
        if (
          filtros.cobertura === "aprovada" &&
          !lista.some((c) => c.status === "aprovada" && c.execucao_status === "prevista")
        )
          return false;
        if (
          filtros.cobertura === "realizada" &&
          !lista.some((c) => c.execucao_status === "realizada")
        )
          return false;
      }
      if (termo && !(o.colaborador?.nome ?? "").toLowerCase().includes(termo)) return false;
      return true;
    });
  }, [lista.data, filtros.busca, filtros.somentePendentes, filtros.cobertura, coberturasPorOcorrencia]);


  const config = useQuery({
    queryKey: ["dp_ocorrencia_config", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("dp_ocorrencia_config", {
        _company_id: selectedCompanyId!,
      });
      if (error) throw error;
      const row = (data ?? [])[0];
      return {
        prazoRetroativoDias: row?.prazo_retroativo_dias ?? 3,
        coberturaAprovacao: row?.cobertura_aprovacao ?? "sempre",
      };
    },
  });

  const registrar = useMutation({
    mutationFn: async (input: RegistrarOcorrenciaInput) => {
      const { data, error } = await supabase.rpc("dp_ocorrencia_registrar", {
        _colaborador_id: input.colaboradorId,
        _data: input.data,
        _tipo: input.tipo,
        _justificativa: input.justificativa ?? null,
        _horario_estimado: input.horarioEstimado ?? null,
        _horario_real: input.horarioReal ?? null,
        _marcacao_alvo: input.marcacaoAlvo ?? null,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Ocorrência registrada.");
    },
    onError: (e: Error) => toast.error(textoErroOcorrencia(e.message)),
  });

  const confirmar = useMutation({
    mutationFn: async (input: {
      id: string;
      horarioReal?: string | null;
      justificativaFinal?: string | null;
      confirmar?: boolean;
    }) => {
      const { error } = await supabase.rpc("dp_ocorrencia_confirmar", {
        _ocorrencia_id: input.id,
        _horario_real: input.horarioReal ?? null,
        _justificativa_final: input.justificativaFinal ?? null,
        _confirmar_falta: input.confirmar ?? true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Ocorrência atualizada.");
    },
    onError: (e: Error) => toast.error(textoErroOcorrencia(e.message)),
  });

  const complementar = useMutation({
    mutationFn: async (input: { id: string; texto: string }) => {
      const { error } = await supabase.rpc("dp_ocorrencia_complementar", {
        _ocorrencia_id: input.id,
        _texto: input.texto,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Complemento registrado.");
    },
    onError: (e: Error) => toast.error(textoErroOcorrencia(e.message)),
  });

  const classificar = useMutation({
    mutationFn: async (input: {
      id: string;
      impactaAssiduidade?: OcorrenciaImpacto;
      impactaFerias?: OcorrenciaImpacto;
    }) => {
      const { error } = await supabase.rpc("dp_ocorrencia_classificar", {
        _ocorrencia_id: input.id,
        _impacta_assiduidade: input.impactaAssiduidade ?? null,
        _impacta_ferias: input.impactaFerias ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Impactos atualizados.");
    },
    onError: (e: Error) => toast.error(textoErroOcorrencia(e.message)),
  });

  const analisar = useMutation({
    mutationFn: async (input: { id: string; status: OcorrenciaAnalise; observacao?: string }) => {
      const { error } = await supabase.rpc("dp_ocorrencia_analisar", {
        _ocorrencia_id: input.id,
        _status: input.status,
        _observacao: input.observacao ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Análise registrada.");
    },
    onError: (e: Error) => toast.error(textoErroOcorrencia(e.message)),
  });

  const tratar = useMutation({
    mutationFn: async (input: { id: string; decisao: string; observacao?: string }) => {
      const { error } = await supabase.rpc("dp_ocorrencia_tratar", {
        _ocorrencia_id: input.id,
        _decisao: input.decisao,
        _observacao: input.observacao ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Tratativa registrada. Isso não altera o ponto.");
    },
    onError: (e: Error) => toast.error(textoErroOcorrencia(e.message)),
  });

  const cancelar = useMutation({
    mutationFn: async (input: { id: string; motivo: string }) => {
      const { error } = await supabase.rpc("dp_ocorrencia_cancelar", {
        _ocorrencia_id: input.id,
        _motivo: input.motivo,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Ocorrência cancelada.");
    },
    onError: (e: Error) => toast.error(textoErroOcorrencia(e.message)),
  });

  const invalidateCoberturas = () => {
    invalidate();
    qc.invalidateQueries({ queryKey: ["dp_ocorrencia_coberturas"] });
    qc.invalidateQueries({ queryKey: ["dp_pendencias"] });
  };

  const criarCobertura = useMutation({
    mutationFn: async (input: {
      ocorrenciaId: string;
      substitutoColaboradorId?: string | null;
      maoDeObraExtraId?: string | null;
      entrada?: string | null;
      saida?: string | null;
    }) => {
      const { data, error } = await supabase.rpc("dp_ocorrencia_cobertura_criar", {
        _ocorrencia_id: input.ocorrenciaId,
        _substituto_colaborador_id: input.substitutoColaboradorId ?? undefined,
        _mao_de_obra_extra_id: input.maoDeObraExtraId ?? undefined,
        _entrada: input.entrada ?? undefined,
        _saida: input.saida ?? undefined,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      invalidateCoberturas();
      toast.success("Cobertura registrada.");
    },
    onError: (e: Error) => toast.error(textoErroOcorrencia(e.message)),
  });

  const decidirCobertura = useMutation({
    mutationFn: async (input: { coberturaId: string; aprovar: boolean; motivoRecusa?: string }) => {
      const { error } = await supabase.rpc("dp_ocorrencia_cobertura_decidir", {
        _cobertura_id: input.coberturaId,
        _aprovar: input.aprovar,
        _motivo_recusa: input.motivoRecusa ?? undefined,
      });
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      invalidateCoberturas();
      toast.success(v.aprovar ? "Cobertura aprovada." : "Cobertura recusada.");
    },
    onError: (e: Error) => toast.error(textoErroOcorrencia(e.message)),
  });

  const confirmarCobertura = useMutation({
    mutationFn: async (coberturaId: string) => {
      const { error } = await supabase.rpc("dp_ocorrencia_cobertura_confirmar", {
        _cobertura_id: coberturaId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateCoberturas();
      toast.success("Cobertura confirmada como realizada.");
    },
    onError: (e: Error) => toast.error(textoErroOcorrencia(e.message)),
  });

  return {
    ocorrencias,
    total: lista.data?.length ?? 0,
    loading: lista.isLoading,
    config: config.data,
    coberturasPorOcorrencia,
    registrar,
    confirmar,
    complementar,
    classificar,
    analisar,
    tratar,
    cancelar,
    criarCobertura,
    decidirCobertura,
    confirmarCobertura,
  };
}

