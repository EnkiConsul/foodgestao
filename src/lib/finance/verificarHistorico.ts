/**
 * Verificação de histórico ANTES do DELETE.
 *
 * Enquanto as chaves estrangeiras seguem com ON DELETE SET NULL, um DELETE
 * direto apagaria o cadastro e desvincularia os lançamentos silenciosamente.
 * Aqui consultamos o banco antes de excluir e bloqueamos a operação com a
 * mesma mensagem exibida quando o próprio banco recusa (histórico vinculado).
 *
 * A consulta respeita RLS: só enxerga os lançamentos que o usuário já pode ver.
 */

import { supabase } from "@/integrations/supabase/client";
import { mensagemHistoricoVinculado, type CadastroFinanceiro } from "./exclusaoHistorico";

type Coluna = "payment_method_id" | "cost_center_id" | "contact_id" | "category_id" | "credit_card_id";

const CADASTRO_POR_COLUNA: Record<Coluna, CadastroFinanceiro> = {
  payment_method_id: "forma de pagamento",
  cost_center_id: "centro de custo",
  contact_id: "contato",
  category_id: "categoria",
  credit_card_id: "cartão",
};

export type Bloqueio = { title: string; description: string };

async function contarLancamentos(coluna: Coluna, ids: string[]): Promise<Set<string>> {
  const comHistorico = new Set<string>();
  if (ids.length === 0) return comHistorico;
  // Busca as próprias linhas (não só a contagem) para saber QUAIS ids estão em uso.
  const { data, error } = await (supabase as any)
    .from("transactions")
    .select(coluna)
    .in(coluna, ids)
    .limit(1000);
  if (error) throw error;
  (data ?? []).forEach((row: Record<string, string | null>) => {
    const valor = row[coluna];
    if (valor) comHistorico.add(valor);
  });
  return comHistorico;
}

/** Ids que possuem lançamentos vinculados na coluna indicada. */
export async function idsComLancamentos(coluna: Coluna, ids: string[]): Promise<Set<string>> {
  return contarLancamentos(coluna, ids);
}

/**
 * Verifica um único cadastro simples (forma de pagamento, centro de custo,
 * contato, categoria ou cartão). Devolve a mensagem de bloqueio ou null.
 */
export async function verificarExclusaoSimples(
  coluna: Coluna,
  id: string,
  nome?: string | null,
): Promise<Bloqueio | null> {
  const usados = await contarLancamentos(coluna, [id]);
  return usados.has(id) ? mensagemHistoricoVinculado(CADASTRO_POR_COLUNA[coluna], nome) : null;
}

/** Conta e descendentes, a partir do mapa pai → filhos já carregado na tela. */
export function coletarArvore(id: string, filhosPorId: Map<string, string[]>): string[] {
  const acc: string[] = [];
  const visitar = (atual: string) => {
    acc.push(atual);
    (filhosPorId.get(atual) ?? []).forEach(visitar);
  };
  visitar(id);
  return acc;
}

/**
 * Conta contábil: não há coluna direta em transactions. O vínculo é
 * transactions.category_id → categories.chart_account_id, considerando também
 * as contas descendentes (árvore).
 */
export async function verificarExclusaoContaContabil(
  contaIds: string[],
  nome?: string | null,
): Promise<Bloqueio | null> {
  if (contaIds.length === 0) return null;
  const { data: cats, error } = await (supabase as any)
    .from("categories")
    .select("id")
    .in("chart_account_id", contaIds);
  if (error) throw error;
  const categoriaIds = (cats ?? []).map((c: { id: string }) => c.id);
  if (categoriaIds.length === 0) return null;
  const usados = await contarLancamentos("category_id", categoriaIds);
  return usados.size > 0 ? mensagemHistoricoVinculado("conta contábil", nome) : null;
}

/** Quais contas contábeis (entre as informadas) possuem histórico indireto. */
export async function contasContabeisComHistorico(contaIds: string[]): Promise<Set<string>> {
  const bloqueadas = new Set<string>();
  if (contaIds.length === 0) return bloqueadas;
  const { data: cats, error } = await (supabase as any)
    .from("categories")
    .select("id, chart_account_id")
    .in("chart_account_id", contaIds);
  if (error) throw error;
  const linhas = (cats ?? []) as { id: string; chart_account_id: string | null }[];
  if (linhas.length === 0) return bloqueadas;
  const usados = await contarLancamentos(
    "category_id",
    linhas.map((c) => c.id),
  );
  linhas.forEach((c) => {
    if (c.chart_account_id && usados.has(c.id)) bloqueadas.add(c.chart_account_id);
  });
  return bloqueadas;
}
