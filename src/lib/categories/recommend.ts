/**
 * Recomendação de categoria a partir do texto do lançamento.
 *
 * Motor 100% client-side e determinístico: pontua as categorias disponíveis
 * comparando a descrição digitada (mais a forma de pagamento e o tipo de
 * transação) com as `keywords`, `examples`, `guidance_include` e
 * `ai_description` cadastradas na categoria. Devolve também os termos que
 * casaram, para exibir a justificativa da sugestão ao usuário.
 */

export type RecommendCategoryInput = {
  id: string;
  name: string;
  transaction_type?: string | null;
  is_active?: boolean | null;
  keywords?: string[] | null;
  examples?: string | null;
  guidance_include?: string | null;
  guidance_exclude?: string | null;
  ai_description?: string | null;
};

export type CategoryRecommendation = {
  categoryId: string;
  categoryName: string;
  score: number;
  /** 0..1 — confiança relativa ao melhor casamento possível. */
  confidence: number;
  matchedKeywords: string[];
  matchedExamples: string[];
  /** Termos vindos das orientações (o que lançar / descrição). */
  matchedGuidance: string[];
  /** Frase pronta explicando o motivo da sugestão. */
  reason: string;
};

const STOPWORDS = new Set([
  "de", "da", "do", "das", "dos", "e", "em", "no", "na", "nos", "nas", "para",
  "por", "com", "sem", "um", "uma", "uns", "umas", "o", "a", "os", "as", "ao",
  "aos", "à", "às", "que", "the", "of", "ref", "pgto", "pag", "valor", "total",
]);

export function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value: string): string[] {
  return normalizeText(value)
    .split(" ")
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
}

/** Divide `examples` por vírgula/ponto-e-vírgula/barra/pipe. */
function splitTerms(value?: string | null): string[] {
  if (!value) return [];
  return value
    .split(/[,;|/\n]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3);
}

/** Um termo casa se aparecer inteiro no texto, ou se todos os seus tokens estiverem presentes. */
function termMatches(term: string, haystack: string, tokens: Set<string>): boolean {
  const norm = normalizeText(term);
  if (!norm) return false;
  if (norm.includes(" ")) {
    if (haystack.includes(norm)) return true;
    const parts = norm.split(" ").filter((p) => p.length >= 3);
    return parts.length > 0 && parts.every((p) => tokens.has(p) || haystack.includes(p));
  }
  if (norm.length < 3) return false;
  return tokens.has(norm) || haystack.includes(norm);
}

type Options = {
  description: string;
  /** "entrada" | "saida" | "transferencia" */
  transactionType?: string | null;
  /** Nome da forma de pagamento selecionada (ex.: "Cartão de crédito", "Pix"). */
  paymentMethodName?: string | null;
  /** Máximo de sugestões retornadas. */
  limit?: number;
  /** Score mínimo para considerar a sugestão relevante. */
  minScore?: number;
};

const W_KEYWORD = 6;
const W_EXAMPLE = 4;
const W_GUIDANCE = 2;
const W_NAME = 3;
const W_PAYMENT = 2;
const P_EXCLUDE = 5;

export function recommendCategories(
  categories: RecommendCategoryInput[],
  {
    description,
    transactionType,
    paymentMethodName,
    limit = 3,
    minScore = 4,
  }: Options,
): CategoryRecommendation[] {
  const desc = (description ?? "").trim();
  if (desc.length < 3) return [];

  const haystack = normalizeText(
    [desc, paymentMethodName ?? ""].filter(Boolean).join(" "),
  );
  const descTokens = new Set(tokenize(desc));
  const paymentTokens = new Set(tokenize(paymentMethodName ?? ""));
  if (descTokens.size === 0) return [];

  const results: CategoryRecommendation[] = [];

  for (const cat of categories) {
    if (cat.is_active === false) continue;
    if (
      transactionType &&
      transactionType !== "transferencia" &&
      cat.transaction_type &&
      cat.transaction_type !== transactionType
    ) {
      continue;
    }

    const matchedKeywords: string[] = [];
    const matchedExamples: string[] = [];
    const matchedGuidance: string[] = [];
    let score = 0;

    for (const kw of cat.keywords ?? []) {
      if (!kw) continue;
      if (termMatches(kw, haystack, descTokens)) {
        matchedKeywords.push(kw);
        score += W_KEYWORD;
        if (paymentTokens.size > 0 && termMatches(kw, normalizeText(paymentMethodName ?? ""), paymentTokens)) {
          score += W_PAYMENT;
        }
      }
    }

    for (const ex of splitTerms(cat.examples)) {
      if (termMatches(ex, haystack, descTokens)) {
        matchedExamples.push(ex);
        score += W_EXAMPLE;
      }
    }

    for (const term of [
      ...tokenize(cat.guidance_include ?? ""),
      ...tokenize(cat.ai_description ?? ""),
    ]) {
      if (descTokens.has(term) && !matchedGuidance.includes(term)) {
        matchedGuidance.push(term);
        score += W_GUIDANCE;
      }
    }

    for (const term of tokenize(cat.name)) {
      if (descTokens.has(term)) score += W_NAME;
    }

    // Orientação de exclusão penaliza a categoria.
    for (const term of splitTerms(cat.guidance_exclude)) {
      if (termMatches(term, haystack, descTokens)) score -= P_EXCLUDE;
    }

    if (score >= minScore) {
      results.push({
        categoryId: cat.id,
        categoryName: cat.name,
        score,
        confidence: 0,
        matchedKeywords: matchedKeywords.slice(0, 6),
        matchedExamples: matchedExamples.slice(0, 4),
        matchedGuidance: matchedGuidance.slice(0, 4),
        reason: buildReason(matchedKeywords, matchedExamples, matchedGuidance, paymentMethodName, transactionType),
      });
    }
  }

  results.sort((a, b) => b.score - a.score || a.categoryName.localeCompare(b.categoryName));
  const best = results[0]?.score ?? 0;
  return results.slice(0, limit).map((r) => ({
    ...r,
    confidence: best > 0 ? Math.min(1, Math.max(0.35, r.score / Math.max(best, 12))) : 0,
  }));
}

function buildReason(
  keywords: string[],
  examples: string[],
  guidance: string[],
  paymentMethodName?: string | null,
  transactionType?: string | null,
): string {
  const parts: string[] = [];
  if (keywords.length) parts.push(`palavras-chave: ${keywords.slice(0, 4).join(", ")}`);
  if (examples.length) parts.push(`exemplos: ${examples.slice(0, 3).join(", ")}`);
  if (!keywords.length && !examples.length && guidance.length) {
    parts.push(`orientação da categoria: ${guidance.slice(0, 3).join(", ")}`);
  }
  const typeLabel =
    transactionType === "entrada" ? "entrada" : transactionType === "saida" ? "saída" : null;
  const tail = [
    typeLabel ? `tipo ${typeLabel}` : null,
    paymentMethodName ? `forma de pagamento ${paymentMethodName}` : null,
  ].filter(Boolean);
  if (tail.length) parts.push(tail.join(" · "));
  return parts.length ? `Casou com ${parts.join(" · ")}.` : "Casou com a orientação da categoria.";
}

export function recommendCategory(
  categories: RecommendCategoryInput[],
  options: Options,
): CategoryRecommendation | null {
  return recommendCategories(categories, { ...options, limit: 1 })[0] ?? null;
}
