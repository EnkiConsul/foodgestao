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

