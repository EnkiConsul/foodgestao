import { supabase } from "@/integrations/supabase/client";

/**
 * Rotinas oficiais de estado administrativo das solicitações (atestados,
 * licenças e adiantamento). O aplicativo não grava mais direto nas tabelas:
 * o servidor deriva o usuário, a empresa e o colaborador, confere a permissão
 * e aplica as regras na mesma transação.
 */

export function somaDias(iso: string, dias: number) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** Período final de um afastamento a partir da data inicial e dos dias. */
export function periodoAfastamento(dataInicio: string, dias: number) {
  const d = Number.isFinite(dias) && dias > 0 ? dias : 0;
  return { data_alvo: dataInicio, data_fim: d > 0 ? somaDias(dataInicio, d) : dataInicio };
}

export async function corrigirAtestado(params: {
  solicitacaoId: string;
  colaboradorId: string;
  dataInicio: string;
  dias: number;
  observacao?: string | null;
  justificativa?: string | null;
}) {
  const { data_alvo, data_fim } = periodoAfastamento(params.dataInicio, params.dias);
  const { error } = await supabase.rpc("dp_solicitacao_corrigir", {
    p_id: params.solicitacaoId,
    p_colaborador: params.colaboradorId,
    p_data_alvo: data_alvo,
    p_data_fim: data_fim,
    p_motivo: params.observacao?.trim() ? params.observacao.trim() : null,
    p_justificativa: params.justificativa?.trim() ? params.justificativa.trim() : null,
  });
  if (error) throw error;
}

export async function excluirSolicitacao(params: { solicitacaoId: string; motivo?: string | null }) {
  const { error } = await supabase.rpc("dp_solicitacao_excluir", {
    p_id: params.solicitacaoId,
    p_motivo: params.motivo?.trim() ? params.motivo.trim() : null,
  });
  if (error) throw error;
}

export async function registrarRetornoLicenca(params: {
  solicitacaoId: string;
  acao: "confirmar" | "prorrogar";
  data: string;
  observacao?: string | null;
}) {
  const { error } = await supabase.rpc("dp_licenca_retorno_registrar", {
    p_id: params.solicitacaoId,
    p_acao: params.acao,
    p_data: params.data,
    p_observacao: params.observacao?.trim() ? params.observacao.trim() : null,
  });
  if (error) throw error;
}

export type AdiantamentoRegistroResultado = {
  ok: boolean;
  solicitacao_id: string;
  competencia_efeito: string;
  origem: "gestor" | "portal";
  duplicada: boolean;
};

export async function registrarAdiantamento(params: {
  colaboradorId: string;
  tipo: "ativar" | "cancelar";
  data: string;
  observacao?: string | null;
}): Promise<AdiantamentoRegistroResultado> {
  const { data, error } = await supabase.rpc("dp_adiantamento_registrar", {
    p_colaborador: params.colaboradorId,
    p_tipo: params.tipo,
    p_data: params.data,
    p_observacao: params.observacao?.trim() ? params.observacao.trim() : null,
  });
  if (error) throw error;
  return data as unknown as AdiantamentoRegistroResultado;
}
