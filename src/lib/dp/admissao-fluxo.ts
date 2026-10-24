/** Regras de apresentação; as autorizações oficiais permanecem no servidor. */
export function efetivacaoDisponivel(regime: string, status: string, asoValido: boolean, fichaConferida: boolean, permitirSemFicha = false): boolean {
  if (regime === "clt" || regime === "intermitente") {
    if (!asoValido) return false;
    if (permitirSemFicha) return ["enviado_contabilidade", "aguardando_retorno_contabilidade", "registro_recebido"].includes(status);
    return status === "registro_recebido" && fichaConferida;
  }
  return ["pronto_contabilidade", "enviado_contabilidade", "aguardando_retorno_contabilidade", "registro_recebido"].includes(status);
}

/** O salvamento já terminou; pendências aqui não são falhas de gravação. */
export async function finalizarDepoisDeSalvar(finalizar: () => Promise<void>, avisar: (erro: unknown) => void): Promise<void> {
  try { await finalizar(); } catch (erro) { avisar(erro); }
}

export async function salvarAntesDeAvancar(salvar: () => Promise<void>, avancar: () => void): Promise<void> {
  await salvar();
  avancar();
}

export function inicioJornadaAdmissao(inicioLoja?: string | null, admissao?: string | null): string {
  return inicioLoja || admissao || "";
}