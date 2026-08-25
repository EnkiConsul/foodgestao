/**
 * Endurecimento de segurança da tela de consentimento OAuth.
 *
 * Regras:
 * - A decisão (autorizar/recusar) só vale com um nonce de origem própria,
 *   criado nesta aba para este authorization_id (proteção anti-CSRF /
 *   anti-clickjacking: nenhuma outra origem consegue gerar o nonce).
 * - A página nunca pode rodar dentro de iframe.
 * - A página nunca é indexada e não envia referrer (evita vazar
 *   authorization_id / query string para terceiros).
 * - Nada de token, sessão ou detalhes brutos em console/logs.
 */

const STORAGE_PREFIX = "oauth_consent_nonce:";

function storage(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function randomNonce(): string {
  const cryptoObj = globalThis.crypto;
  if (cryptoObj?.getRandomValues) {
    const bytes = new Uint8Array(16);
    cryptoObj.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  }
  return `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
}

/** Cria e persiste o nonce da requisição de consentimento atual. */
export function createConsentNonce(authorizationId: string): string {
  const nonce = randomNonce();
  storage()?.setItem(STORAGE_PREFIX + authorizationId, nonce);
  return nonce;
}

/** Valida que o nonce apresentado foi criado nesta aba para este authorization_id. */
export function verifyConsentNonce(authorizationId: string, nonce: string | null | undefined): boolean {
  if (!authorizationId || !nonce) return false;
  const expected = storage()?.getItem(STORAGE_PREFIX + authorizationId);
  return Boolean(expected) && expected === nonce;
}

/** Consome (invalida) o nonce após a decisão, impedindo replay. */
export function clearConsentNonce(authorizationId: string): void {
  storage()?.removeItem(STORAGE_PREFIX + authorizationId);
}

/** True quando a página está embutida em um frame de qualquer origem. */
export function isFramed(): boolean {
  try {
    return window.top !== window.self;
  } catch {
    // Acesso bloqueado => certamente está em frame de outra origem.
    return true;
  }
}

/** Aplica noindex e referrer no-referrer na própria página de consentimento. */
export function applyConsentMetaHardening(doc: Document = document): void {
  const ensure = (name: string, content: string) => {
    let tag = doc.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
    if (!tag) {
      tag = doc.createElement("meta");
      tag.setAttribute("name", name);
      doc.head.appendChild(tag);
    }
    tag.setAttribute("content", content);
  };
  ensure("robots", "noindex, nofollow, noarchive");
  ensure("referrer", "no-referrer");
}
