/** Regras de apresentação; as autorizações oficiais permanecem no servidor. */
export function efetivacaoDisponivel(regime: string, status: string, asoValido: boolean, fichaConferida: boolean): boolean {
  if (regime === "clt" || regime === "intermitente") {
    return status === "registro_recebido" && asoValido && fichaConferida;
  }
  return ["pronto_contabilidade", "enviado_contabilidade", "aguardando_retorno_contabilidade", "registro_recebido"].includes(status);
}

export async function salvarAntesDeAvancar(salvar: () => Promise<void>, avancar: () => void): Promise<void> {
  await salvar();
  avancar();
}

export function inicioJornadaAdmissao(inicioLoja?: string | null, admissao?: string | null): string {
  return inicioLoja || admissao || "";
}