import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import type { Database } from "@/integrations/supabase/types";
import { snapshotDaConvocacao, type NovaConvocacaoInput } from "@/lib/dp/convocacoes";

export type ConvocacaoRow = Database["public"]["Tables"]["dp_convocacoes"]["Row"] & {
  dp_colaboradores?: { nome: string; regime: string | null } | null;
  dp_turnos?: { nome: string } | null;
};

export interface NovaConvocacao extends NovaConvocacaoInput {
  colaborador_id: string;
  unidade_id: string | null;
  turno_id: string | null;
  observacao: string | null;
}

/** Traduz os códigos do servidor para o texto que o gestor lê na tela. */
function mensagemErroConvocacao(raw: string | null | undefined): string {
  const msg = raw ?? "";
  if (msg.includes("DUPLICATE_REQUEST"))
    return "Este colaborador já tem uma convocação ativa nesta data.";
  if (msg.includes("STATUS_INVALIDO")) return "Esta convocação não pode mais ser cancelada.";
  if (msg.includes("CONVOCACAO_FLUXO_NOVO"))
    return "Cancele esta oferta pelo painel de convocações.";
  if (msg.includes("FORBIDDEN")) return "Você não tem permissão para esta ação.";
  if (msg.includes("INVALID_INPUT")) return "Revise os dados informados da convocação.";
  return "Não foi possível concluir a ação. Tente novamente.";
}


/** Convocações da empresa (visão administrativa) para um intervalo de datas. */
export function useDpConvocacoes(inicio: string, fim: string, colaboradorId?: string | null) {
  const { selectedCompanyId } = useCompanyContext();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["dp_convocacoes", selectedCompanyId, inicio, fim, colaboradorId ?? null],
    enabled: !!selectedCompanyId,
    queryFn: async (): Promise<ConvocacaoRow[]> => {
      let q = supabase
        .from("dp_convocacoes")
        .select(
          "*, dp_colaboradores!dp_convocacoes_colaborador_id_fkey(nome, regime), dp_turnos(nome)",
        )
        .eq("company_id", selectedCompanyId!)
        .gte("data", inicio)
        .lte("data", fim)
        .order("data");
      if (colaboradorId) q = q.eq("colaborador_id", colaboradorId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as ConvocacaoRow[];
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["dp_convocacoes"] });

  /** Criação da convocação: empresa, papel, horário e duplicidade validados no servidor. */
  const criar = useMutation({
    mutationFn: async (form: NovaConvocacao) => {
      const snap = snapshotDaConvocacao(form);
      const { error } = await supabase.rpc("dp_convocacao_criar", {
        p_colaborador: form.colaborador_id,
        p_data: form.data,
        p_entrada: snap.entrada,
        p_saida: snap.saida,
        p_intervalo_minutos: snap.intervalo_minutos,
        p_termina_no_dia_seguinte: snap.termina_no_dia_seguinte,
        p_carga_prevista_horas: snap.carga_prevista_horas,
        p_unidade: (form.unidade_id) ?? undefined,
        p_turno: (form.turno_id) ?? undefined,
        p_prazo_resposta: form.prazo_resposta ?? undefined,
        p_observacao: (form.observacao) ?? undefined,
      });
      if (error) throw new Error(mensagemErroConvocacao(error.message));
    },
    onSuccess: invalidate,
  });

  const cancelar = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("dp_convocacao_cancelar", {
        p_id: id,
        p_motivo: undefined,
      });
      if (error) throw new Error(mensagemErroConvocacao(error.message));
    },
    onSuccess: invalidate,
  });

  return { rows: query.data ?? [], isLoading: query.isLoading, error: query.error, criar, cancelar };
}

/** Oferta enriquecida devolvida pela RPC do Portal (dados do snapshot). */
export interface MinhaOferta {
  id: string;
  data: string;
  status: string;
  entrada: string;
  saida: string;
  intervalo_minutos: number;
  termina_no_dia_seguinte: boolean;
  carga_prevista_horas: number;
  prazo_resposta: string | null;
  inicio_previsto: string | null;
  fim_previsto: string | null;
  visualizada_em: string | null;
  respondida_em: string | null;
  motivo_recusa: string | null;
  observacao: string | null;
  compatibilidade: string | null;
  regime_snapshot: string | null;
  remuneracao_snapshot: any;
  timezone_snapshot: string | null;
  modalidade: string | null;
  vagas: number | null;
  vagas_restantes: number | null;
  necessidade_entrada: string | null;
  necessidade_saida: string | null;
  necessidade_termina_no_dia_seguinte: boolean | null;
  cargo_nome: string | null;
  unidade_nome: string | null;
  resposta_tipo: string | null;
  parcial_status: string | null;
  parcial_entrada: string | null;
  parcial_saida: string | null;
  parcial_termina_no_dia_seguinte: boolean | null;
  parcial_carga_horas: number | null;
  parcial_observacao: string | null;
  parcial_decisao_motivo: string | null;
  janela_comecou?: boolean | null;
  janela_terminou?: boolean | null;
  minutos_de_atraso?: number | null;
  aceite_atrasado?: boolean | null;
  aceite_atraso_minutos?: number | null;
  aceite_atraso_justificativa?: string | null;
  aceite_atraso_forma?: string | null;
}

/** Proposta de horário parcial de um dia (Portal do colaborador). */
export interface PropostaParcialInput {
  id: string;
  entrada: string;
  saida: string;
  termina_no_dia_seguinte: boolean;
  observacao?: string | null;
  /** Obrigatória quando o horário do dia já começou. */
  justificativaAtraso?: string | null;
}


/** Uma proposta parcial aguardando a decisão do gestor. */
export interface ParcialPendente {
  convocacao_id: string;
  ocorrencia_id: string | null;
  data: string;
  colaborador_id: string;
  colaborador_nome: string | null;
  cargo_nome: string | null;
  unidade_nome: string | null;
  necessidade_entrada: string | null;
  necessidade_saida: string | null;
  necessidade_termina_no_dia_seguinte: boolean | null;
  parcial_entrada: string | null;
  parcial_saida: string | null;
  parcial_termina_no_dia_seguinte: boolean | null;
  parcial_carga_horas: number | null;
  parcial_observacao: string | null;
  aceite_atrasado?: boolean | null;
  aceite_atraso_minutos?: number | null;
  aceite_atraso_justificativa?: string | null;
  aceite_atraso_forma?: string | null;

  proposta_em: string | null;
  prazo_resposta: string | null;
  inicio_previsto: string | null;
  reoferta_prazo: string | null;
  reofertas_pendentes: number;
}

export interface AptoParcial {
  colaborador_id: string;
  colaborador_nome: string | null;
  entrada: string | null;
  saida: string | null;
  termina_no_dia_seguinte: boolean;
  carga_prevista_horas: number | null;
}

export interface AvaliacaoParcial {
  convocacao_id: string;
  data: string;
  necessidade_entrada: string;
  necessidade_saida: string;
  necessidade_termina_no_dia_seguinte: boolean;
  parcial_entrada: string | null;
  parcial_saida: string | null;
  parcial_termina_no_dia_seguinte: boolean;
  descoberto_inicio_minutos: number | null;
  descoberto_fim_minutos: number | null;
  reofertas_pendentes: number;
  reoferta_prazo: string | null;
  aptos: AptoParcial[];
}

/**
 * Propostas de horário parcial aguardando o gestor + avaliação e decisão.
 * Toda a regra (quem está apto, reoferta, recusa) é decidida no servidor.
 */
export function useDpConvocacoesParciais() {
  const { selectedCompanyId } = useCompanyContext();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["dp_convocacoes_parciais", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async (): Promise<ParcialPendente[]> => {
      const { data, error } = await (supabase.rpc as any)("dp_convocacao_parciais_pendentes", {
        p_company_id: selectedCompanyId,
      });
      if (error) throw error;
      return (data ?? []) as ParcialPendente[];
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["dp_convocacoes_parciais"] });
    qc.invalidateQueries({ queryKey: ["dp_convocacoes"] });
    qc.invalidateQueries({ queryKey: ["dp_minhas_convocacoes"] });
  };

  const avaliar = useMutation({
    mutationFn: async (id: string): Promise<AvaliacaoParcial> => {
      const { data, error } = await (supabase.rpc as any)("dp_convocacao_avaliar_parcial", {
        p_convocacao_id: id,
      });
      if (error) throw error;
      return data as AvaliacaoParcial;
    },
  });

  const decidir = useMutation({
    mutationFn: async (args: {
      id: string;
      acao: "APROVAR" | "RECUSAR" | "REOFERTAR";
      motivo?: string | null;
      prazo?: string | null;
      colaboradorIds?: string[] | null;
      confirmado?: boolean;
    }) => {
      const { data, error } = await (supabase.rpc as any)("dp_convocacao_decidir_parcial", {
        p_convocacao_id: args.id,
        p_acao: args.acao,
        p_motivo: args.motivo ?? null,
        p_prazo: args.prazo ?? null,
        p_colaborador_ids: args.colaboradorIds ?? null,
        p_confirmado: args.confirmado ?? false,
      });
      if (error) throw error;
      return data as any;
    },
    onSuccess: invalidate,
  });

  return {
    rows: query.data ?? [],
    isLoading: query.isLoading,
    refetch: query.refetch,
    avaliar,
    decidir,
  };
}


/** Convocações do colaborador logado (Portal), lidas pela RPC autoritativa. */
export function useMinhasConvocacoes(colaboradorId: string | null) {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["dp_minhas_convocacoes", colaboradorId],
    enabled: !!colaboradorId,
    queryFn: async (): Promise<MinhaOferta[]> => {
      const { data, error } = await (supabase.rpc as any)("dp_convocacao_minhas_ofertas");
      if (error) throw error;
      return (data ?? []) as MinhaOferta[];
    },
  });

  /**
   * Resposta pela RPC atômica: vagas de oferta aberta, prazo, dia já iniciado e
   * limite de uma convocação confirmada por dia são decididos no servidor.
   * A RPC devolve `ok: false` quando a oferta é encerrada (prazo, início, vaga).
   */
  const responder = useMutation({
    mutationFn: async ({
      id, aceito, motivo, justificativaAtraso,
    }: { id: string; aceito: boolean; motivo?: string; justificativaAtraso?: string | null }) => {
      const { data, error } = await (supabase.rpc as any)("dp_convocacao_responder_oferta", {
        p_convocacao_id: id,
        p_aceito: aceito,
        p_motivo: motivo ?? undefined,
        p_atraso_justificativa: justificativaAtraso ?? null,
      });
      if (error) throw error;
      return data as any;
    },

    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dp_minhas_convocacoes"] });
      qc.invalidateQueries({ queryKey: ["dp_convocacoes"] });
    },
  });

  /**
   * Propõe cobrir apenas parte do horário pedido. O dia fica reservado e
   * segue para aprovação do gestor — o servidor valida a janela.
   */
  const proporParcial = useMutation({
    mutationFn: async (input: PropostaParcialInput) => {
      const { data, error } = await (supabase.rpc as any)("dp_convocacao_responder_oferta", {
        p_convocacao_id: input.id,
        p_aceito: true,
        p_parcial_entrada: input.entrada,
        p_parcial_saida: input.saida,
        p_parcial_termina_no_dia_seguinte: input.termina_no_dia_seguinte,
        p_parcial_observacao: input.observacao ?? null,
        p_atraso_justificativa: input.justificativaAtraso ?? null,

      });
      if (error) throw error;
      return data as any;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dp_minhas_convocacoes"] });
      qc.invalidateQueries({ queryKey: ["dp_convocacoes"] });
      qc.invalidateQueries({ queryKey: ["dp_convocacoes_parciais"] });
    },
  });

  /** Registra a visualização da oferta (idempotente no servidor). */
  const registrarVisualizacao = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await (supabase.rpc as any)(
        "dp_convocacao_registrar_visualizacao",
        { p_convocacao_id: id },
      );
      if (error) throw error;
      return data as any;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dp_minhas_convocacoes"] }),
  });

  const pendentes = useMemo(
    () => (query.data ?? []).filter((c) => c.status === "pendente"),
    [query.data],
  );

  return {
    rows: query.data ?? [],
    pendentes,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
    responder,
    proporParcial,
    registrarVisualizacao,
  };

}

