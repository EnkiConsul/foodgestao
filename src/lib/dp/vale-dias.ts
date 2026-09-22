// ------------------------------------------------------------------
// Domínio: DP → Vales por dia (dias informados pelo gestor)
//
// Regras puras dos campos de dias da calculadora de vales: o gestor pode
// informar os dias a trabalhar quando a escala ainda não reflete folgas e
// férias. Um dia só é aceito como número inteiro de 0 a 31.
// ------------------------------------------------------------------

export const DIAS_MIN = 0;
export const DIAS_MAX = 31;

export interface DiasInformados {
  /** Texto aceito para o campo (vazio quando o gestor apagou o valor). */
  valor: string;
  /** Mensagem quando o número informado está fora do permitido. */
  erro: string | null;
}

/** Normaliza o que foi digitado num campo de dias (0 a 31). */
export function limitarDias(bruto: string): DiasInformados {
  const digitos = bruto.replace(/\D/g, "").slice(0, 3);
  if (digitos === "") return { valor: "", erro: null };
  const numero = Number(digitos);
  if (numero > DIAS_MAX) {
    return { valor: String(DIAS_MAX), erro: `Informe de ${DIAS_MIN} a ${DIAS_MAX} dias.` };
  }
  return { valor: String(numero), erro: null };
}

/** Número efetivo de dias de um campo (vazio conta como zero). */
export function diasNumero(valor: string): number {
  return valor === "" ? 0 : Number(valor);
}

/** Houve ajuste manual em relação ao que o sistema calculou? */
export function diasAjustadosPeloGestor(informado: string, calculado: number): boolean {
  if (informado === "") return true;
  return diasNumero(informado) !== calculado;
}
