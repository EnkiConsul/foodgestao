// ------------------------------------------------------------------
// Padrão de títulos do sistema: inicial maiúscula em cada palavra,
// mantendo conectivos curtos em minúsculo (padrão de título em português)
// e preservando siglas e nomes de marca.
// ------------------------------------------------------------------

/** Conectivos que ficam minúsculos quando não são a primeira palavra. */
const CONECTIVOS = new Set([
  "de", "da", "do", "das", "dos",
  "e", "em", "no", "na", "nos", "nas",
  "para", "com", "a", "o", "as", "os",
  "ao", "aos", "à", "às", "por", "pra", "num", "numa",
]);

/** Siglas e marcas mantidas exatamente como estão. */
const PRESERVAR = [
  "CLT", "DP", "PIX", "CPF", "CNPJ", "RG", "PJ", "PF", "MEI", "DSR", "FGTS",
  "INSS", "IRRF", "ASO", "EPI", "EPIs", "SESMT", "TRCT", "IA", "PDF", "CSV",
  "360°FOOD", "13º", "eSocial",
];

const PRESERVAR_MAP = new Map(PRESERVAR.map((s) => [s.toLowerCase(), s]));

function capitalizarPalavra(palavra: string): string {
  // Palavras compostas por hífen: "Pré-Admissão".
  if (palavra.includes("-")) {
    return palavra.split("-").map(capitalizarPalavra).join("-");
  }
  const preservada = PRESERVAR_MAP.get(palavra.toLowerCase());
  if (preservada) return preservada;
  // Já tem maiúscula no meio (siglas, nomes próprios estilizados): não mexe.
  if (/[A-ZÁÉÍÓÚÂÊÔÃÕÇ]/.test(palavra.slice(1))) return palavra;
  const primeira = palavra.charAt(0);
  return primeira.toLocaleUpperCase("pt-BR") + palavra.slice(1).toLocaleLowerCase("pt-BR");
}

/**
 * Aplica o padrão de título do sistema: "horário de trabalho" → "Horário de Trabalho".
 * Usar em títulos de página, card, seção, menu, diálogo, aba e coluna de tabela —
 * nunca em descrições, toasts, placeholders ou conteúdo digitado pelo usuário.
 */
export function tituloSistema(texto: string): string {
  if (!texto) return texto;
  const palavras = texto.trim().split(/(\s+)/);
  let indiceReal = -1;
  return palavras
    .map((parte) => {
      if (/^\s+$/.test(parte)) return parte;
      indiceReal += 1;
      const semPontuacao = parte.replace(/[^\p{L}\p{N}º°-]/gu, "");
      if (!semPontuacao) return parte;
      const ehConectivo = CONECTIVOS.has(semPontuacao.toLocaleLowerCase("pt-BR"));
      if (indiceReal > 0 && ehConectivo && !PRESERVAR_MAP.has(semPontuacao.toLowerCase())) {
        return parte.toLocaleLowerCase("pt-BR");
      }
      return parte.replace(semPontuacao, capitalizarPalavra(semPontuacao));
    })
    .join("");
}
