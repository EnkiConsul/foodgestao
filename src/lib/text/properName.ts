/**
 * Nomes próprios e razões sociais (pt-BR).
 *
 * Nomes vindos do Open Finance chegam em CAIXA ALTA (como no extrato do banco),
 * enquanto os digitados na plataforma vêm em caixa mista. Esta função normaliza
 * a APRESENTAÇÃO para caixa mista, preservando siglas empresariais e marcas.
 *
 * Diferente de `toTitleCase` (títulos de tela), que trata qualquer palavra
 * inteiramente em maiúsculas como sigla — e por isso manteria "CARREFOUR".
 */

/** Sufixos/siglas empresariais que devem permanecer em maiúsculas. */
const UPPER_TOKENS = new Set([
  "LTDA", "LTDA.", "ME", "EPP", "MEI", "SA", "S/A", "S.A", "S.A.", "S/S",
  "EIRELI", "CIA", "CIA.", "SS", "SCP", "SPE", "CNPJ", "CPF", "PIX",
  "IP", "S/A.", "EI",
]);

/** Palavras de ligação que ficam em minúsculas (exceto na primeira posição). */
const LOWER_TOKENS = new Set([
  "de", "da", "do", "das", "dos", "e", "em", "na", "no", "nas", "nos",
  "a", "o", "as", "os", "com", "para", "por", "sem", "sob", "sobre",
]);

const capitalize = (word: string) =>
  word.charAt(0).toLocaleUpperCase("pt-BR") + word.slice(1).toLocaleLowerCase("pt-BR");

/** true quando o token não tem letras (números, pontuação, símbolos). */
const hasNoLetters = (token: string) => !/[a-zA-ZÀ-ÿ]/.test(token);

function formatToken(token: string, isFirst: boolean): string {
  if (!token || hasNoLetters(token)) return token;

  const upper = token.toLocaleUpperCase("pt-BR");
  if (UPPER_TOKENS.has(upper)) return upper;

  // Sigla curta já em maiúsculas ("GR", "JBS", "BR") — preserva.
  if (token === upper && token.replace(/[^A-ZÀ-Ý]/g, "").length <= 3) return token;

  const lowerKey = token.toLocaleLowerCase("pt-BR");
  if (!isFirst && LOWER_TOKENS.has(lowerKey)) return lowerKey;

  // Palavras com apóstrofo ou hífen internos: capitaliza cada parte.
  if (/['’]/.test(token)) {
    return token
      .split(/(['’])/)
      .map((p) => (p === "'" || p === "’" ? p : capitalize(p)))
      .join("");
  }

  return capitalize(token);
}

/**
 * Normaliza um nome de pessoa ou razão social para caixa mista.
 * Retorna string vazia para valores nulos.
 */
export function toProperName(input: string | null | undefined): string {
  if (!input) return "";
  const value = String(input).replace(/\s+/g, " ").trim();
  if (!value) return "";

  let wordIndex = 0;
  return value
    .split(/(\s+|-|\/)/)
    .map((part) => {
      if (/^\s+$/.test(part) || part === "-" || part === "/") return part;
      const out = formatToken(part, wordIndex === 0);
      wordIndex++;
      return out;
    })
    .join("");
}
