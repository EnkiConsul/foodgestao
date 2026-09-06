/**
 * Controle de versão (carimbo `updated_at`) do rascunho de convocação.
 *
 * As funções do banco recusam gravações com carimbo defasado (erro 40001,
 * `CONCURRENT_MODIFICATION`). Aqui centralizamos a releitura do carimbo atual
 * e um retry único, para que o fluxo de publicação não falhe por causa de um
 * carimbo antigo guardado na tela.
 */

export function ehConflitoDeVersao(erro: unknown): boolean {
  const e = erro as { code?: string; message?: string } | null;
  const msg = String(e?.message ?? "");
  return e?.code === "40001" || msg.includes("CONCURRENT_MODIFICATION");
}

/**
 * Executa `acao` com o carimbo atual do grupo. Em conflito de versão, relê o
 * carimbo e tenta uma única vez mais.
 */
export async function comCarimboAtual<T>(
  lerCarimbo: () => Promise<string | null>,
  acao: (carimbo: string | null) => Promise<T>,
): Promise<T> {
  const carimbo = await lerCarimbo();
  try {
    return await acao(carimbo);
  } catch (erro) {
    if (!ehConflitoDeVersao(erro)) throw erro;
    const novo = await lerCarimbo();
    return await acao(novo);
  }
}
