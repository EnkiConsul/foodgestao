/**
 * Roteamento das linhas da conciliação: contas de cartão do Open Finance
 * (`type = 'CREDIT'`) precisam virar lançamento no cartão (`credit_card_id`),
 * não em conta bancária. Linhas de cartão sem cartão autorizado ficam retidas.
 */

export interface CardRoutingMaps {
  /** pluggy_account_id das contas espelhadas com tipo CREDIT. */
  cardPluggyAccounts: Set<string>;
  /** pluggy_account_id -> credit_cards.id autorizado pelo usuário. */
  cardByPluggyAccount: Record<string, string>;
}

export function isCardPluggyAccount(pluggyAccountId: string, maps: CardRoutingMaps): boolean {
  return maps.cardPluggyAccounts.has(pluggyAccountId) || !!maps.cardByPluggyAccount[pluggyAccountId];
}

export function resolveCardId(pluggyAccountId: string, maps: CardRoutingMaps): string | null {
  return maps.cardByPluggyAccount[pluggyAccountId] ?? null;
}

export interface RoutedRows {
  /** ids agrupados por credit_cards.id */
  byCard: Record<string, string[]>;
  /** ids que seguem o fluxo normal de conta bancária */
  bankIds: string[];
  /** ids de cartão ainda sem autorização (não podem ser confirmados) */
  blockedIds: string[];
}

/**
 * Separa os ids selecionados entre cartão, banco e bloqueados.
 * `getPluggyAccount` devolve a conta Pluggy de origem da linha.
 */
export function routeStagingRows(
  ids: string[],
  getPluggyAccount: (id: string) => string | null | undefined,
  maps: CardRoutingMaps,
): RoutedRows {
  const byCard: Record<string, string[]> = {};
  const bankIds: string[] = [];
  const blockedIds: string[] = [];

  for (const id of ids) {
    const pa = getPluggyAccount(id) ?? "";
    if (!pa || !isCardPluggyAccount(pa, maps)) {
      bankIds.push(id);
      continue;
    }
    const cardId = resolveCardId(pa, maps);
    if (!cardId) {
      blockedIds.push(id);
      continue;
    }
    byCard[cardId] = byCard[cardId] ?? [];
    byCard[cardId].push(id);
  }

  return { byCard, bankIds, blockedIds };
}

export interface CreditCardOption {
  id: string;
  brand: string | null;
  last4: string | null;
  issuer: string | null;
}

/** Rótulo curto do cartão para exibir no lugar do seletor de conta. */
export function creditCardLabel(card: CreditCardOption | undefined | null): string | null {
  if (!card) return null;
  const parts = [card.brand?.trim() || card.issuer?.trim() || "Cartão"];
  if (card.last4) parts.push(`•••• ${card.last4}`);
  return parts.join(" ");
}

/**
 * Nomes de conta vindos do Open Finance às vezes são placeholders
 * ("Sem nome"); nesses casos não devem ser exibidos ao usuário.
 */
const PROVIDER_NAME_PLACEHOLDERS = new Set(["sem nome", "-", "--", "n/a", "na", "null", "undefined"]);

/** Normaliza o nome vindo do provedor, devolvendo null para placeholders. */
export function cleanProviderName(name: string | null | undefined): string | null {
  const value = (name ?? "").trim();
  if (!value) return null;
  return PROVIDER_NAME_PLACEHOLDERS.has(value.toLowerCase()) ? null : value;
}


export interface RowDirectionInput {
  amount: number;
  /** `type` bruto do Open Finance ("DEBIT" | "CREDIT" | null). */
  type?: string | null;
  /** true quando a linha vem de uma conta de cartão de crédito. */
  isCardAccount: boolean;
}

/**
 * Orientação da linha (entrada/saída).
 *
 * Contas bancárias: valor positivo = entrada.
 * Contas de cartão: a convenção do Open Finance é invertida — compras vêm
 * positivas com `DEBIT` (saída) e pagamentos/estornos negativos com `CREDIT`
 * (entrada).
 */
export function resolveRowDirection({ amount, type, isCardAccount }: RowDirectionInput): "entrada" | "saida" {
  if (!isCardAccount) return amount >= 0 ? "entrada" : "saida";
  const t = (type ?? "").trim().toUpperCase();
  if (t === "DEBIT") return "saida";
  if (t === "CREDIT") return "entrada";
  return amount >= 0 ? "saida" : "entrada";
}

/** Atalho booleano para uso em JSX. */
export function isRowEntrada(input: RowDirectionInput): boolean {
  return resolveRowDirection(input) === "entrada";
}

/**
 * Valor exibido conforme a direção da linha (e não conforme o sinal cru do
 * provedor): saída fica negativa, entrada positiva. Assim compra no cartão
 * aparece como -R$ 34,90 e pagamento de fatura como R$ 146,68.
 */
export function signedRowAmount(input: RowDirectionInput): number {
  const abs = Math.abs(Number(input.amount ?? 0));
  return resolveRowDirection(input) === "saida" ? -abs : abs;
}

/** Extrai o id da fatura do cartão (`creditCardMetadata.billId`) do dado bruto. */
export function cardBillId(raw: unknown): string | null {
  const meta = (raw as { creditCardMetadata?: { billId?: unknown } } | null)?.creditCardMetadata;
  const id = meta?.billId;
  return typeof id === "string" && id.trim() ? id.trim() : null;
}

export interface DuplicateCandidateRow {
  id: string;
  date: string;
  amount: number;
  status: string;
  pluggy_account_id: string;
  raw?: unknown;
  created_at?: string | null;
}

/**
 * Linhas pendentes de cartão que o banco reenviou com outro id do provedor:
 * mesma conta, mesma data, mesmo valor absoluto e mesma fatura. Devolve os ids
 * das versões antigas (fica pendente apenas a mais recente).
 */
export function findCardDuplicateIds(
  rows: DuplicateCandidateRow[],
  isCardAccount: (pluggyAccountId: string) => boolean,
): Set<string> {
  const groups = new Map<string, DuplicateCandidateRow[]>();
  for (const r of rows) {
    if (r.status !== "pending") continue;
    if (!isCardAccount(r.pluggy_account_id)) continue;
    const bill = cardBillId(r.raw);
    if (!bill) continue;
    const key = `${r.pluggy_account_id}|${bill}|${r.date}|${Math.abs(Number(r.amount ?? 0)).toFixed(2)}`;
    const list = groups.get(key);
    if (list) list.push(r);
    else groups.set(key, [r]);
  }

  const dupes = new Set<string>();
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const sorted = list
      .slice()
      .sort((a, b) => String(a.created_at ?? "").localeCompare(String(b.created_at ?? "")) || a.id.localeCompare(b.id));
    for (const r of sorted.slice(0, -1)) dupes.add(r.id);
  }
  return dupes;
}

