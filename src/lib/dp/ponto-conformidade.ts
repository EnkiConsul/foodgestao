import { LIMITE_PONTO_OBRIGATORIO } from "@/lib/dp/ficha-registro/inferencia";

/** Situação da unidade frente ao Art. 74, § 2º da CLT (registro de ponto acima de 20 pessoas). */
export type PontoConformidade = "nao_obrigatorio" | "ok" | "justificado" | "irregular";

export const MIN_JUSTIFICATIVA_PONTO = 10;

export interface UnidadePontoInfo {
  possui_relogio_ponto?: boolean | null;
  relogio_ponto_dispensa_justificativa?: string | null;
}

export function pontoObrigatorioPorLotacao(ativos: number): boolean {
  return ativos > LIMITE_PONTO_OBRIGATORIO;
}

export function justificativaValida(texto: string | null | undefined): boolean {
  return (texto ?? "").trim().length >= MIN_JUSTIFICATIVA_PONTO;
}

export function conformidadePonto(unidade: UnidadePontoInfo, ativos: number): PontoConformidade {
  if (!pontoObrigatorioPorLotacao(ativos)) return "nao_obrigatorio";
  if (unidade.possui_relogio_ponto) return "ok";
  return justificativaValida(unidade.relogio_ponto_dispensa_justificativa) ? "justificado" : "irregular";
}

export const AVISO_ART74 =
  "Pelo Art. 74, § 2º da CLT, estabelecimentos com mais de 20 colaboradores são obrigados a registrar o ponto. Sem o registro, a empresa pode ser autuada e, em ação trabalhista, vale a jornada alegada pelo empregado (Súmula 338 do TST).";
