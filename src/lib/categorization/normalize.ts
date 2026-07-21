/**
 * Normaliza descrições de lançamentos financeiros brasileiros,
 * removendo ruído previsível de extratos (PIX/TED/NSU/datas/CNPJ/máscaras
 * de cartão) para permitir match determinístico por regras.
 *
 * IMPORTANTE: este arquivo deve ficar em paridade EXATA com a função SQL
 * `private.normalize_description`. Toda mudança aqui exige a migration
 * correspondente (e vice-versa). Testes em `normalize.test.ts` garantem
 * a paridade dos casos-chave.
 */

// Remove acentos preservando o restante dos caracteres.
function unaccent(input: string): string {
  return input.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

// Regexes com "boundary" \b (equivalente a \y do PostgreSQL para palavras ASCII).
const PAYMENT_NOISE_RE =
  /\b(PIX|TED|DOC|TRANSF(?:ERENCIA)?|PAGAMENTO|PAGTO|COMPRA|DEBITO|CREDITO|CARTAO|RECEBIDO|ENVIADO|BOLETO|SAQUE|TARIFA)\b/g;

// Identificadores rotulados: "NSU 12345", "REF: abc", "AUT 987".
const LABELED_ID_RE = /\b(NSU|DOC|AUT|REF|CV|TID)\b\s*:?\s*\w+/g;

// Datas dd/mm(/aaaa).
const DATE_RE = /\d{2}\/\d{2}(?:\/\d{2,4})?/g;

// CNPJ, máscara de cartão (com espaço opcional), sequências numéricas longas.
const CNPJ_MASK_LONG_RE =
  /(\*{2,}\s*\d+|\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}|\b\d{6,}\b)/g;

// Sigla com pontos ("S.A." → "SA", "S.A.S." → "SAS").
const ACRONYM_DOT_RE = /(?<=[A-Z])\.(?=[A-Z]\b|[A-Z]\.)/g;

// Pontuação restante e espaços duplicados.
const PUNCT_SPACES_RE = /[^A-Z0-9 ]+|\s{2,}/g;

export function normalizeDescription(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  let s = unaccent(String(raw)).toUpperCase();
  s = s.replace(ACRONYM_DOT_RE, "");
  s = s.replace(PAYMENT_NOISE_RE, " ");
  s = s.replace(LABELED_ID_RE, " ");
  s = s.replace(DATE_RE, " ");
  s = s.replace(CNPJ_MASK_LONG_RE, " ");
  s = s.replace(PUNCT_SPACES_RE, " ");
  s = s.replace(/\s{2,}/g, " ").trim();
  return s.length === 0 ? null : s;
}
