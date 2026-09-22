/**
 * Origem da admissão: liga a admissão em andamento (link de pré-admissão ou
 * ficha de registro) à pessoa do banco de folguistas / em teste.
 *
 * Quem grava é a rotina oficial no servidor (`dp_pessoa_apoio_vincular_origem`):
 * ela confere a empresa, a permissão e, quando o cadastro já existe, conclui a
 * promoção na mesma transação. Repetir a chamada não muda nada.
 */
import { supabase } from "@/integrations/supabase/client";

export interface OrigemApoioResultado {
  status: "vinculado" | "promovido" | "ja_promovido";
  colaborador_id?: string | null;
}

const MENSAGENS: Record<string, string> = {
  APOIO_OBRIGATORIO: "Escolha a pessoa que será promovida.",
  APOIO_ORIGEM_UNICA: "Informe apenas uma origem da admissão.",
  APOIO_NAO_ENCONTRADO: "A pessoa não foi encontrada nesta empresa.",
  APOIO_ADMISSAO_INVALIDA: "A admissão informada não pertence a esta empresa.",
  APOIO_ADMISSAO_DE_OUTRA_PESSOA: "Esta admissão já está ligada a outra pessoa.",
};

/** Frase de tela para as recusas da rotina oficial. */
export function mensagemOrigemApoio(erro: unknown): string {
  const texto = erro instanceof Error ? erro.message : String(erro ?? "");
  for (const [codigo, frase] of Object.entries(MENSAGENS)) {
    if (texto.includes(codigo)) return frase;
  }
  return "Não foi possível ligar a admissão à pessoa agora.";
}

export async function vincularOrigemApoio(
  pessoaApoioId: string,
  origem: { preadmissaoId?: string | null; fichaItemId?: string | null },
): Promise<OrigemApoioResultado> {
  const cliente = supabase as unknown as {
    rpc(
      fn: "dp_pessoa_apoio_vincular_origem",
      args: { p_pessoa_apoio_id: string; p_preadmissao_id: string | null; p_ficha_item_id: string | null },
    ): PromiseLike<{ data: OrigemApoioResultado | null; error: { message: string } | null }>;
  };
  const { data, error } = await cliente.rpc("dp_pessoa_apoio_vincular_origem", {
    p_pessoa_apoio_id: pessoaApoioId,
    p_preadmissao_id: origem.preadmissaoId ?? null,
    p_ficha_item_id: origem.fichaItemId ?? null,
  });
  if (error) throw new Error(error.message);
  return data ?? { status: "vinculado" };
}
