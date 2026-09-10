/**
 * Normalização do ponteiro de próxima página do /v2/transactions da Pluggy.
 *
 * A API responde o ponteiro em `next` (às vezes `nextCursor`), que pode vir como
 * caminho completo (`/v2/transactions?...`), query string (`?pageCursor=...`),
 * URL absoluta ou apenas o valor do cursor. Enviar o caminho inteiro em
 * `after=` gera 400 "Invalid cursor"; ignorar `next` faz a leitura parar na
 * primeira página. Este util é a fonte única para os dois caminhos de leitura.
 */
export function nextTransactionsPath(next: string | null | undefined): string | null {
  if (!next) return null;
  const raw = String(next).trim();
  if (!raw) return null;
  if (raw.startsWith("/")) return raw;
  if (raw.startsWith("?")) return `/v2/transactions${raw}`;
  if (raw.startsWith("http")) {
    try {
      const u = new URL(raw);
      return `${u.pathname}${u.search}`;
    } catch {
      return null;
    }
  }
  return `/v2/transactions?pageCursor=${encodeURIComponent(raw)}`;
}

/** Lê o ponteiro de próxima página de uma resposta, aceitando os dois nomes. */
export function readNextPointer(
  payload: { next?: string | null; nextCursor?: string | null } | null | undefined,
): string | null {
  if (!payload) return null;
  return nextTransactionsPath(payload.next ?? payload.nextCursor ?? null);
}
