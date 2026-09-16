/**
 * Aviso de regra do Pessoas.
 *
 * Diferente de uma falha (rede, banco, defeito), um aviso de regra é uma
 * resposta esperada: "este dia já atingiu o limite", "o período ainda não
 * abriu". Nesses casos o colaborador deve ler a frase exata da regra, e nada
 * disso vai para a Auditoria de erros.
 */
export class RegraNegada extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RegraNegada";
  }
}

/** Lança um aviso de regra com a mensagem que o colaborador deve ler. */
export function negarRegra(mensagem: string): never {
  throw new RegraNegada(mensagem);
}

export function ehRegraNegada(error: unknown): error is RegraNegada {
  return error instanceof RegraNegada || (error as { name?: string } | null)?.name === "RegraNegada";
}
