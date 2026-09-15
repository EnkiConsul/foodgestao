/**
 * Contrato TIPADO das rotinas transacionais da ficha de registro.
 *
 * `dp_ficha_aplicar` e `dp_ficha_ignorar` gravam tudo em UMA transação no banco
 * (colaborador + configuração vigente + dias + item + contadores). Os tipos
 * gerados do banco só passam a conhecê-las depois que a migração é aplicada;
 * até então usamos esta assinatura explícita — argumentos e retorno com tipo
 * próprio, sem `any`, para que erro de forma continue aparecendo no build.
 */
import { supabase } from "@/integrations/supabase/client";

export interface AplicarFichaRpcArgs {
  p_item_id: string;
  /** Colunas do cadastro vindas da ficha revisada (o servidor filtra pela allowlist). */
  p_dados: Record<string, unknown>;
  /** Dados brutos da revisão, gravados no item. */
  p_dados_extraidos: Record<string, unknown>;
  /** Colunas escolhidas na comparação lado a lado (null = todas as preenchidas). */
  p_campos: string[] | null;
  p_atualizar_existente: boolean;
  p_cargo_id: string | null;
  p_unidade_id: string | null;
  p_setor_id: string | null;
  p_turno_id: string | null;
  p_regime: string | null;
  p_forma_pagamento: string | null;
  p_possui_folha_ponto: boolean;
  p_optante_adiantamento: boolean;
  /** { dias: [{ dow, trabalha, entrada, saida, intervalo_minutos }] } ou null. */
  p_jornada: { dias: Array<Record<string, unknown>> } | null;
}

export interface AplicarFichaRpcResultado {
  colaborador_id: string;
  status: "criado" | "atualizado";
  ja_aplicado: boolean;
  criados?: number;
  atualizados?: number;
  pendentes?: number;
  /** Caminho autoritativo do PDF do lote (nunca vem do cliente). */
  arquivo_path: string | null;
  pagina_inicio: number | null;
  pagina_fim: number | null;
}

export interface IgnorarFichaRpcResultado {
  status: "ignorado";
  criados: number;
  atualizados: number;
  pendentes: number;
}

type RpcResposta<T> = { data: T | null; error: { message: string } | null };
type RpcTipada = {
  (fn: "dp_ficha_aplicar", args: AplicarFichaRpcArgs): PromiseLike<RpcResposta<AplicarFichaRpcResultado>>;
  (fn: "dp_ficha_ignorar", args: { p_item_id: string }): PromiseLike<RpcResposta<IgnorarFichaRpcResultado>>;
};

/** Ponte única para as duas rotinas enquanto os tipos do banco não as incluem. */
const rpc = supabase.rpc as unknown as RpcTipada;

export async function aplicarFichaRpc(args: AplicarFichaRpcArgs): Promise<AplicarFichaRpcResultado> {
  const { data, error } = await rpc("dp_ficha_aplicar", args);
  if (error) throw new Error(error.message);
  if (!data?.colaborador_id) throw new Error("A ficha não pôde ser aplicada.");
  return data;
}

export async function ignorarFichaRpc(itemId: string): Promise<IgnorarFichaRpcResultado> {
  const { data, error } = await rpc("dp_ficha_ignorar", { p_item_id: itemId });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("A ficha não pôde ser ignorada.");
  return data;
}
