/**
 * Title Case (PT-BR) — primeira letra de cada palavra maiúscula,
 * exceto artigos, preposições e conjunções curtas.
 *
 * - Primeira palavra do título sempre capitalizada.
 * - Siglas em maiúscula permanecem em maiúscula (PF, PJ, DP, CPF, CNPJ, ACT, CCT, PIX, IA).
 * - Marcas preservadas: 360°FOOD, Lovable.
 */

const LOWER = new Set([
  "a", "o", "as", "os", "um", "uma", "uns", "umas",
  "de", "da", "do", "das", "dos", "em", "na", "no", "nas", "nos",
  "por", "para", "com", "sem", "sob", "sobre", "entre", "até", "ante", "após",
  "e", "ou", "mas", "nem", "se", "que",
]);

const BRANDS: Record<string, string> = {
  "360°food": "360°FOOD",
  "360food": "360°FOOD",
  "lovable": "Lovable",
};

const stripDiacritics = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

const isAcronym = (word: string) =>
  /^[A-ZÁÉÍÓÚÂÊÎÔÛÃÕÇ0-9°]{2,}$/.test(word);

const capitalize = (word: string) => {
  if (!word) return word;
  const first = word.charAt(0).toLocaleUpperCase("pt-BR");
  return first + word.slice(1).toLocaleLowerCase("pt-BR");
};

export function toTitleCase(input: string | null | undefined): string {
  if (!input) return "";
  const parts = input.split(/(\s+|[—–\-/])/);
  let wordIndex = 0;
  return parts
    .map((part) => {
      if (/^\s+$/.test(part) || /^[—–\-/]$/.test(part)) return part;
      const brand = BRANDS[part.toLowerCase()];
      if (brand) {
        wordIndex++;
        return brand;
      }
      if (isAcronym(part)) {
        wordIndex++;
        return part;
      }
      const lowerKey = stripDiacritics(part);
      const isFirst = wordIndex === 0;
      wordIndex++;
      if (!isFirst && LOWER.has(lowerKey)) return part.toLocaleLowerCase("pt-BR");
      return capitalize(part);
    })
    .join("");
}
