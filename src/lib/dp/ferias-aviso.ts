/**
 * Aviso de férias: a lei manda comunicar o colaborador por escrito com pelo
 * menos 30 dias de antecedência do início das férias (CLT, art. 135). Aqui
 * ficam as regras de prazo, os rótulos dos selos e a validação do registro
 * retroativo (quando a comunicação foi feita fora do sistema).
 */

/** Antecedência mínima legal do aviso de férias, em dias. */
export const AVISO_FERIAS_PRAZO_DIAS = 30;

export type AvisoFeriasGozo = {
  data_inicio: string;
  aviso_em?: string | null;
  aviso_enviado_em?: string | null;
  aviso_fora_prazo?: boolean | null;
  aviso_retroativo?: boolean | null;
  aviso_justificativa?: string | null;
  ciente_em?: string | null;
};

const dia = 86_400_000;

const asDate = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00`);

/** Dias entre o aviso e o início das férias (negativo = aviso após o início). */
export function diasDeAntecedencia(dataInicio: string, avisoEm: string): number {
  return Math.round((asDate(dataInicio).getTime() - asDate(avisoEm).getTime()) / dia);
}

/** O aviso ficou abaixo do prazo legal de 30 dias? */
export function avisoForaDoPrazo(dataInicio: string, avisoEm: string): boolean {
  return diasDeAntecedencia(dataInicio, avisoEm) < AVISO_FERIAS_PRAZO_DIAS;
}

export type AvisoSelo = {
  chave: "sem_aviso" | "aguardando_ciencia" | "ciente" | "fora_prazo" | "retroativo";
  label: string;
  tone: string;
};

/** Selos do aviso, na ordem em que devem aparecer no card das férias. */
export function selosAviso(gozo: AvisoFeriasGozo): AvisoSelo[] {
  const selos: AvisoSelo[] = [];
  if (!gozo.aviso_em) {
    selos.push({
      chave: "sem_aviso",
      label: "Aviso de férias não registrado",
      tone: "bg-destructive/15 text-destructive",
    });
    return selos;
  }
  if (gozo.aviso_fora_prazo) {
    selos.push({
      chave: "fora_prazo",
      label: "Aviso fora do prazo",
      tone: "bg-destructive/15 text-destructive",
    });
  }
  if (gozo.aviso_retroativo) {
    selos.push({
      chave: "retroativo",
      label: "Aviso registrado retroativamente",
      tone: "bg-amber-500/15 text-amber-600",
    });
  }
  selos.push(
    gozo.ciente_em
      ? { chave: "ciente", label: "Ciente", tone: "bg-emerald-500/15 text-emerald-600" }
      : {
          chave: "aguardando_ciencia",
          label: "Aviso enviado — aguardando ciência",
          tone: "bg-sky-500/15 text-sky-600",
        },
  );
  return selos;
}

export type ValidacaoAviso =
  | { ok: true }
  | { ok: false; motivo: "data" | "futura" | "declaracao" | "anexo" | "justificativa"; texto: string };

/**
 * Valida o registro do aviso antes de chamar o servidor: data retroativa exige
 * declaração de que a comunicação foi formalizada por outro meio e o anexo do
 * comprovante; aviso fora do prazo exige justificativa.
 */
export function validarRegistroAviso(input: {
  dataInicio: string;
  avisoEm: string;
  hojeISO: string;
  declarouComunicacao: boolean;
  temAnexo: boolean;
  justificativa: string;
}): ValidacaoAviso {
  const { dataInicio, avisoEm, hojeISO, declarouComunicacao, temAnexo, justificativa } = input;
  if (!avisoEm) return { ok: false, motivo: "data", texto: "Informe a data do aviso de férias." };
  if (avisoEm > hojeISO) {
    return { ok: false, motivo: "futura", texto: "A data do aviso não pode ser no futuro." };
  }
  const retroativo = avisoEm < hojeISO;
  if (retroativo && !declarouComunicacao) {
    return {
      ok: false,
      motivo: "declaracao",
      texto: "Confirme que a comunicação foi feita formalmente na data informada.",
    };
  }
  if (retroativo && !temAnexo) {
    return {
      ok: false,
      motivo: "anexo",
      texto: "Anexe o comprovante do aviso entregue ao colaborador.",
    };
  }
  if (avisoForaDoPrazo(dataInicio, avisoEm) && justificativa.trim().length < 3) {
    return {
      ok: false,
      motivo: "justificativa",
      texto: "Aviso com menos de 30 dias: escreva a justificativa.",
    };
  }
  return { ok: true };
}
