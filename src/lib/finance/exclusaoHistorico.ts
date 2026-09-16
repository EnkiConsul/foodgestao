/**
 * Mensagens de exclusão bloqueada por histórico financeiro.
 *
 * O banco é a fonte da verdade: as chaves estrangeiras de transactions
 * (forma de pagamento, centro de custo, contato e categoria) usam NO ACTION e
 * a exclusão de conta contábil é barrada por trigger quando existe lançamento
 * ligado à conta ou a uma conta descendente. Aqui só traduzimos o erro.
 */

export type CadastroFinanceiro =
  | "forma de pagamento"
  | "centro de custo"
  | "contato"
  | "categoria"
  | "conta contábil"
  | "conta"
  | "cartão";

const CODIGO_FK = "23503";
const MARCA_TRIGGER = "CONTA_CONTABIL_COM_HISTORICO";

/** Reconhece erro de histórico vinculado (chave estrangeira ou trigger de bloqueio). */
export function ehErroHistoricoVinculado(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { code?: string; message?: string; details?: string };
  if (e.code === CODIGO_FK) return true;
  const texto = `${e.message ?? ""} ${e.details ?? ""}`;
  if (texto.includes(MARCA_TRIGGER)) return true;
  return /violates foreign key constraint|viola a restrição de chave estrangeira/i.test(texto);
}

/** Sugere inativar apenas onde o cadastro tem esse recurso. */
const PERMITE_INATIVAR: Record<CadastroFinanceiro, boolean> = {
  "forma de pagamento": true,
  "centro de custo": true,
  contato: true,
  categoria: true,
  "conta contábil": true,
  conta: true,
  cartão: false,
};

export function mensagemHistoricoVinculado(
  cadastro: CadastroFinanceiro,
  nome?: string | null,
): { title: string; description: string } {
  const alvo = nome?.trim() ? `"${nome.trim()}"` : `esta ${cadastro}`;
  const sufixo = PERMITE_INATIVAR[cadastro]
    ? " Para deixar de usá-la no dia a dia, inative o cadastro em vez de excluir."
    : " Exclua ou reclassifique os lançamentos antes de tentar novamente.";
  return {
    title: "Não é possível excluir",
    description:
      `Existem lançamentos vinculados a ${alvo}. O cadastro foi mantido para preservar o histórico.` +
      sufixo,
  };
}

/**
 * Traduz o erro de exclusão: histórico vinculado vira mensagem específica;
 * qualquer outro erro devolve null para o chamador tratar como falha real.
 */
export function traduzErroExclusao(
  error: unknown,
  cadastro: CadastroFinanceiro,
  nome?: string | null,
): { title: string; description: string } | null {
  return ehErroHistoricoVinculado(error) ? mensagemHistoricoVinculado(cadastro, nome) : null;
}
