/** O progresso do processo não é a navegação entre abas da ficha. */
export function passoAdmissao(status: string, emprego: boolean, asoValido: boolean): number {
  if (status === "concluido") return emprego ? 4 : 2;
  if (!["pronto_contabilidade", "enviado_contabilidade", "aguardando_retorno_contabilidade", "registro_recebido"].includes(status)) return 0;
  if (!emprego) return 1;
  if (!asoValido) return 1;
  return status === "registro_recebido" ? 3 : 2;
}

export function pontoNaAdmissao(salvo: unknown, justificativa: unknown, emprego: boolean, unidadeTemPonto: boolean): boolean {
  if (typeof salvo === "boolean") return salvo;
  return emprego && unidadeTemPonto && !String(justificativa ?? "").trim();
}