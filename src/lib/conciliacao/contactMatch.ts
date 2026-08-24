/**
 * Casamento tolerante entre o nome da contraparte no extrato e o cadastro de
 * fornecedores/clientes.
 *
 * O texto do banco vem cheio de ruído: prefixo de adquirente/marketplace
 * ("Rp3*FIT PROD NATURAIS", "PAG*BARBEARIA", "IFD*IFOOD"), sufixo societário
 * ("RAPTOR SYSTEM LTDA") e caixa alta. A comparação exata por isso quase nunca
 * casa — aqui normalizamos e pontuamos por tokens.
 *
 * Regra de segurança: só sugerimos com pontuação alta e sem empate entre dois
 * contatos diferentes (empate = nenhuma sugestão, para não errar).
 */

/** Prefixos de adquirente/marketplace: "RP3*", "PAG*", "MP ", "IFD*", "PICPAY*". */
const ACQUIRER_PREFIX_RE =
  /^\s*(?:[a-z0-9]{2,6}\s*\*|mp\*?|pag\*?|pagseguro|mercadopago|mercado\s*pago|ifd\*?|ifood|picpay|stone|cielo|rede|getnet|sumup|infinitepay|pagarme)\s*[-*: ]*/i;

/** Sufixos e termos societários que não ajudam na comparação. */
const LEGAL_TOKENS = new Set([
  "ltda", "ltd", "me", "mei", "epp", "eireli", "sa", "s", "a", "cia",
  "comercio", "com", "servicos", "servico", "industria", "ind", "e", "de",
  "da", "do", "dos", "das", "em", "eletronica", "digital", "brasil",
]);

/** Remove ruído de adquirente/marketplace do início do texto. */
export function stripAcquirerNoise(value: string | null | undefined): string {
  let s = String(value ?? "").replace(/\s+/g, " ").trim();
  for (let i = 0; i < 2; i++) {
    const next = s.replace(ACQUIRER_PREFIX_RE, "").trim();
    if (next === s) break;
    s = next;
  }
  return s;
}

/** Chave canônica: minúsculo, sem acento/pontuação, sem ruído de adquirente. */
export function normalizeContactKey(value: string | null | undefined): string {
  return stripAcquirerNoise(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Tokens relevantes (sem termos societários e sem palavras de 1-2 letras). */
export function contactTokens(value: string | null | undefined): string[] {
  return normalizeContactKey(value)
    .split(" ")
    .filter((t) => t.length >= 3 && !LEGAL_TOKENS.has(t));
}

/**
 * Pontuação de 0 a 1 entre o texto do extrato e o nome cadastrado.
 * 1 = chave idêntica; 0.9 = um contém o outro; caso geral = Jaccard de tokens
 * com bônus para tokens que começam igual (prefixo >= 4 letras).
 */
export function contactMatchScore(
  statementName: string | null | undefined,
  contactName: string | null | undefined,
): number {
  const a = normalizeContactKey(statementName);
  const b = normalizeContactKey(contactName);
  if (!a || !b) return 0;
  if (a === b) return 1;

  const ta = contactTokens(statementName);
  const tb = contactTokens(contactName);
  if (ta.length === 0 || tb.length === 0) return 0;

  if (a.includes(b) || b.includes(a)) return 0.9;

  let hits = 0;
  /** Token distintivo em comum (>= 5 letras) — sinal forte de mesmo fornecedor. */
  let strongShared = false;
  for (const t of tb) {
    if (ta.includes(t)) { hits += 1; if (t.length >= 5) strongShared = true; continue; }
    // Prefixo comum longo ("panificadora" x "panifica").
    if (ta.some((o) => o.length >= 4 && t.length >= 4 && (o.startsWith(t) || t.startsWith(o)))) {
      hits += 0.8;
    }
  }
  if (hits === 0) return 0;

  const union = new Set([...ta, ...tb]).size;
  const jaccard = hits / union;
  // Cobertura do cadastro: "Padaria Della" totalmente contido em "DELLA ELDORADO".
  const coverage = hits / tb.length;
  const base = Math.max(jaccard, coverage * 0.85);
  // "Padaria Della" x "DELLA ELDORADO": um token forte em comum já sustenta a
  // sugestão (o desempate em `bestContactMatch` evita escolher errado).
  return strongShared ? Math.max(base, 0.65) : base;
}

export interface MatchCandidate {
  id: string;
  name: string;
}

/** Limiar mínimo para sugerir por nome. */
export const MATCH_THRESHOLD = 0.6;

/**
 * Melhor candidato para o nome do extrato. Devolve null quando nenhum atinge o
 * limiar ou quando há empate técnico entre contatos diferentes.
 */
export function bestContactMatch(
  statementName: string | null | undefined,
  candidates: MatchCandidate[],
  threshold = MATCH_THRESHOLD,
): { id: string; score: number } | null {
  if (!normalizeContactKey(statementName)) return null;
  let best: { id: string; score: number } | null = null;
  let second = 0;
  for (const c of candidates) {
    const score = contactMatchScore(statementName, c.name);
    if (!best || score > best.score) {
      if (best) second = best.score;
      best = { id: c.id, score };
    } else if (score > second) {
      second = score;
    }
  }
  if (!best || best.score < threshold) return null;
  // Empate técnico: preferimos não sugerir a sugerir errado.
  if (second > 0 && best.score - second < 0.05) return null;
  return best;
}
