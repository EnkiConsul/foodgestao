/**
 * Confiança da leitura de cada campo e situação da ficha na revisão.
 * O sistema nunca inventa dado: campo não encontrado fica "ausente" e aparece
 * em branco para o usuário preencher.
 */

export type NivelConfianca = "alta" | "media" | "baixa" | "ausente";

export const CONFIANCA_LABEL: Record<NivelConfianca, string> = {
  alta: "Identificado",
  media: "Revisar",
  baixa: "Revisar",
  ausente: "Não encontrado",
};

/** Campos sem os quais o cadastro não pode ser criado. */
export const CAMPOS_ESSENCIAIS = ["nome", "cpf"] as const;

export function nivelDoCampo(
  valor: unknown,
  confianca: Record<string, string> | null | undefined,
  campo: string,
): NivelConfianca {
  const vazio = valor === null || valor === undefined || String(valor).trim() === "";
  if (vazio) return "ausente";
  const nivel = String(confianca?.[campo] ?? "").toLowerCase();
  if (nivel === "alta" || nivel === "media" || nivel === "baixa") return nivel as NivelConfianca;
  return "media";
}

export type SituacaoFicha = "pendente" | "revisar" | "duplicado";

export function situacaoDaFicha(input: {
  dados: Record<string, unknown>;
  confianca?: Record<string, string> | null;
  duplicado?: boolean;
}): SituacaoFicha {
  if (input.duplicado) return "duplicado";
  for (const campo of CAMPOS_ESSENCIAIS) {
    const nivel = nivelDoCampo(input.dados[campo], input.confianca, campo);
    if (nivel === "ausente" || nivel === "baixa") return "revisar";
  }
  return "pendente";
}

/** Quantidade de campos que merecem olhada do usuário. */
export function contarPendencias(
  dados: Record<string, unknown>,
  confianca?: Record<string, string> | null,
): number {
  return Object.keys(dados).filter((campo) => {
    const nivel = nivelDoCampo(dados[campo], confianca, campo);
    return nivel === "baixa";
  }).length;
}
