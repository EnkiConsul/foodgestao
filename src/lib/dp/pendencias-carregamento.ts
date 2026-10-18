/** Executa blocos independentes sem saturar a conexão do celular. */
export async function executarBlocosPendencias(blocos: Array<() => Promise<void>>, signal: AbortSignal, concorrencia = 4): Promise<void> {
  let proximo = 0;
  await Promise.all(Array.from({ length: Math.min(concorrencia, blocos.length) }, async () => {
    while (proximo < blocos.length) {
      signal.throwIfAborted();
      const bloco = blocos[proximo++];
      await bloco();
    }
  }));
}

/** Cancela também as leituras em curso, não apenas o indicador na tela. */
export async function carregarComPrazo<T>(operacao: (signal: AbortSignal) => Promise<T>, origem: AbortSignal, prazoMs = 30_000): Promise<T> {
  const controller = new AbortController();
  const cancelar = () => controller.abort(origem.reason);
  if (origem.aborted) cancelar();
  origem.addEventListener("abort", cancelar, { once: true });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limite = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const erro = new Error("timeout ao carregar pendências");
      controller.abort(erro);
      reject(erro);
    }, prazoMs);
  });
  try {
    controller.signal.throwIfAborted();
    return await Promise.race([operacao(controller.signal), limite]);
  } finally {
    clearTimeout(timer);
    origem.removeEventListener("abort", cancelar);
  }
}