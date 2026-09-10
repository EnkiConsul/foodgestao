// ------------------------------------------------------------------
// Domínio: DP → sugestão de gênero pelo primeiro nome.
//
// Serve apenas como sugestão para não deixar o campo em branco: nomes ambíguos
// não sugerem nada e a escolha do usuário sempre prevalece. Função pura.
// ------------------------------------------------------------------

export type GeneroSugerido = "F" | "M";

/** Remove acentos e deixa em minúsculas para comparação estável. */
function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/** Nomes de uso comum nos dois gêneros — nunca sugerem. */
const AMBIGUOS = new Set([
  "alex", "ariel", "darci", "darcy", "eli", "gilmar", "jaci", "jacy", "kelvin",
  "lindomar", "mel", "nicola", "remi", "rosana", "sasha", "vale", "wesley",
  "yan", "cassia", "cleuza", "domingos", "jean", "kim", "leci", "nair", "noel",
  "quel", "ray", "reni", "sol", "val", "vanderlei", "zeni",
]);

/** Primeiros nomes femininos que fogem das terminações típicas. */
const FEMININOS = new Set([
  "beatriz", "carmen", "carmem", "cristiane", "eliane", "elisabete", "ester",
  "esther", "iris", "ines", "isabel", "ivete", "jaqueline", "jussara", "karen",
  "karin", "kelly", "lais", "leidiane", "lucimar", "madalena", "mabel",
  "maria", "marisol", "mercedes", "meire", "nicole", "noemi", "raquel",
  "roseli", "rute", "ruth", "sara", "simone", "solange", "sueli", "thais",
  "tais", "vivian", "yasmin", "zilda", "adriane", "cleide", "conceicao",
  "cidinha", "dulce", "edilene", "geane", "gisele", "ivone", "josiane",
  "juliane", "luciane", "marilene", "michele", "michelle", "rosangela",
  "sandrelly", "sonia", "tatiane", "vanessa",
]);

/** Primeiros nomes masculinos terminados em "a"/"e" ou fora do padrão. */
const MASCULINOS = new Set([
  "andre", "aristides", "cassiano", "clovis", "cosme", "daniel", "davi",
  "david", "deivid", "denis", "dinarte", "edson", "elias", "erildson",
  "everton", "ezequiel", "felipe", "filipe", "gabriel", "gilberto", "hebert",
  "heitor", "herick", "isaac", "isaias", "israel", "ivan", "jaime", "joel",
  "jorge", "jose", "josue", "juan", "kaique", "leandro", "levi", "luiz",
  "luis", "manoel", "manuel", "matheus", "mateus", "miguel", "moises",
  "nathan", "nordman", "onofre", "rafael", "raul", "ricardo", "roberto",
  "samuel", "vicente", "wanderson", "wellington", "wilame", "zeca",
]);

/** Terminações que, na prática, identificam o gênero do nome. */
const SUFIXOS_F = [
  "ana", "ane", "ara", "ele", "elle", "ete", "ete", "ia", "iane", "ica",
  "ice", "ina", "ine", "isa", "ita", "lia", "nia", "sa", "ssa", "ta", "ura",
  "a",
];
const SUFIXOS_M = [
  "aldo", "ando", "berto", "ilson", "ilton", "inho", "ison", "ivan", "mar",
  "nei", "ney", "nio", "son", "ton", "valdo", "o", "or", "os", "ir", "el",
  "im", "um", "ao", "l", "r", "z",
];

const maiorSufixo = (nome: string, sufixos: string[]): number => {
  let melhor = 0;
  for (const s of sufixos) if (nome.endsWith(s) && s.length > melhor) melhor = s.length;
  return melhor;
};

/**
 * Sugere o gênero pelo primeiro nome. Retorna null quando o nome é ambíguo,
 * muito curto ou não bate com nenhuma regra.
 */
export function generoPorNome(nomeCompleto?: string | null): GeneroSugerido | null {
  const primeiro = normalizar(String(nomeCompleto ?? "")).split(/\s+/)[0] ?? "";
  if (primeiro.length < 3 || !/^[a-z]+$/.test(primeiro)) return null;
  if (AMBIGUOS.has(primeiro)) return null;
  if (FEMININOS.has(primeiro)) return "F";
  if (MASCULINOS.has(primeiro)) return "M";

  const f = maiorSufixo(primeiro, SUFIXOS_F);
  const m = maiorSufixo(primeiro, SUFIXOS_M);
  if (f > m) return "F";
  if (m > f) return "M";
  return null;
}
