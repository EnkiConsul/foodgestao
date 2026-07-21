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

// Datas dd/mm ou dd/mm/aaaa e identificadores NSU/DOC/AUT/REF/CV/TID seguidos de token.
const DATE_ID_RE =
  /(\d{2}\/\d{2}(?:\/\d{2,4})?|\b(?:NSU|DOC|AUT|REF|CV|TID)\b[\s:]*\w+)/g;

// CNPJ, máscara de cartão (**** 1234) e sequências numéricas longas.
const CNPJ_MASK_LONG_RE = /(\*{2,}\d+|\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}|\b\d{6,}\b)/g;

// Pontuação e espaços duplicados.
const PUNCT_SPACES_RE = /[^A-Z0-9 ]+|\s{2,}/g;

export function normalizeDescription(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  let s = unaccent(String(raw)).toUpperCase();
  s = s.replace(PAYMENT_NOISE_RE, " ");
  s = s.replace(DATE_ID_RE, " ");
  s = s.replace(CNPJ_MASK_LONG_RE, " ");
  // roda 2x para colapsar espaços gerados pelas etapas anteriores
  s = s.replace(PUNCT_SPACES_RE, " ");
  s = s.replace(/\s{2,}/g, " ").trim();
  return s.length === 0 ? null : s;
}
