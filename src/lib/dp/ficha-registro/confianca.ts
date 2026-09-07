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

const semAcento = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/**
 * Trecho do texto lido do PDF que mais se aproxima dos termos informados.
 * Serve para o usuário conferir de onde veio (ou por que faltou) um campo
 * com leitura duvidosa. Devolve null quando nada parecido é encontrado.
 */
export function trechoDoTexto(
  texto: string | null | undefined,
  termos: Array<string | null | undefined>,
  linhasContexto = 1,
): string | null {
  const bruto = (texto ?? "").trim();
  if (!bruto) return null;
  const linhas = bruto.split(/\r?\n/);
  const alvos = termos
    .map((t) => semAcento(String(t ?? "").trim()))
    .filter((t) => t.length >= 3);
  if (alvos.length === 0) return null;

  let melhor = -1;
  let melhorPontos = 0;
  linhas.forEach((linha, i) => {
    const norm = semAcento(linha);
    const pontos = alvos.filter((a) => norm.includes(a)).length;
    if (pontos > melhorPontos) {
      melhorPontos = pontos;
      melhor = i;
    }
  });
  if (melhor < 0) return null;

  const inicio = Math.max(0, melhor - linhasContexto);
  const fim = Math.min(linhas.length, melhor + linhasContexto + 1);
  return linhas
    .slice(inicio, fim)
    .map((l) => l.trim())
    .filter(Boolean)
    .join("\n");
}

