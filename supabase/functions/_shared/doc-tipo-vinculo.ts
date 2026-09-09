// Espelho de src/lib/dp/documento-tipo-por-vinculo.ts (mantenha os dois iguais).
//
// Sócio remunerado por pró-labore não recebe contracheque: o pagamento mensal é
// recibo de pró-labore. A leitura do PDF cai em `contracheque`, então o tipo é
// corrigido na hora de gravar o documento.

export function vinculoEhSocio(vinculoLabel?: string | null): boolean {
  const v = String(vinculoLabel ?? "").trim().toLowerCase();
  return v === "socio" || v === "sócio";
}

const TIPOS_PAGAMENTO_SALARIAL = new Set(["contracheque", "contracheque_13"]);

export interface VinculoDoc {
  vinculo_label?: string | null;
  socio_remuneracao?: string | null;
}

export function tipoCanonicoPorVinculo(tipoLido: string, colaborador?: VinculoDoc | null): string {
  if (!colaborador) return tipoLido;
  const socioProLabore =
    vinculoEhSocio(colaborador.vinculo_label) && colaborador.socio_remuneracao === "pro_labore";
  if (socioProLabore && TIPOS_PAGAMENTO_SALARIAL.has(tipoLido)) return "pro_labore";
  return tipoLido;
}
