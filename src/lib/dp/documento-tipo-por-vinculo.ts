// ------------------------------------------------------------------
// Domínio: DP → natureza canônica do documento conforme o vínculo.
//
// Sócio não é empregado: o pagamento mensal dele é retirada de pró-labore, não
// contracheque. A leitura do PDF costuma trazer "Recibo de Pagamento" e cair em
// `contracheque`; quando a página é vinculada a um sócio remunerado por
// pró-labore, o tipo correto é `pro_labore`.
// ------------------------------------------------------------------

/** Rótulos de vínculo que identificam sócio (dp_colaboradores.vinculo_label). */
export function vinculoEhSocio(vinculoLabel?: string | null): boolean {
  const v = String(vinculoLabel ?? "")
    .trim()
    .toLowerCase();
  return v === "socio" || v === "sócio";
}

/** Tipos de pagamento mensal que, para sócio com pró-labore, viram `pro_labore`. */
const TIPOS_PAGAMENTO_SALARIAL = new Set(["contracheque", "contracheque_13"]);

export interface VinculoDoc {
  vinculo_label?: string | null;
  socio_remuneracao?: string | null;
}

/**
 * Converte o tipo lido no tipo canônico para aquele colaborador.
 * Sem colaborador ou fora dos casos previstos, devolve o tipo original.
 */
export function tipoCanonicoPorVinculo(
  tipoLido: string,
  colaborador?: VinculoDoc | null,
): string {
  if (!colaborador) return tipoLido;
  const socioProLabore =
    vinculoEhSocio(colaborador.vinculo_label) &&
    colaborador.socio_remuneracao === "pro_labore";
  if (socioProLabore && TIPOS_PAGAMENTO_SALARIAL.has(tipoLido)) return "pro_labore";
  return tipoLido;
}
