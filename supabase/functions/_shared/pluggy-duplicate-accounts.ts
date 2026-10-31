// Detecção de conta bancária já ligada em outra empresa (pluggy-sync-item).
// Só contas BANK: o número de cartão (CREDIT) tem 4 dígitos e colide à toa.
// Igualdade = número + connector_id + agência (quando ambos os lados têm).

export function agencyFromTransferNumber(t: string | null | undefined): string | null {
  const parts = typeof t === 'string' ? t.split('/') : [];
  return parts.length >= 3 ? (parts[1]?.trim() || null) : null;
}

export interface NewAccountKey { type?: string | null; number?: string | null; transferNumber?: string | null }
export interface ExistingAccountKey {
  type: string | null;
  number_masked: string | null;
  transfer_number: string | null;
  connector_id: number | string | null;
}

export function bankAccountNumbers(accounts: NewAccountKey[]): string[] {
  return accounts
    .filter((a) => String(a.type ?? '').toUpperCase() === 'BANK' && !!a.number)
    .map((a) => a.number as string);
}

export function isSameBankAccount(
  a: NewAccountKey,
  connectorId: number | string | null,
  b: ExistingAccountKey,
): boolean {
  if (String(a.type ?? '').toUpperCase() !== 'BANK') return false;
  if (String(b.type ?? '').toUpperCase() !== 'BANK') return false;
  if (!a.number || a.number !== b.number_masked) return false;
  if (connectorId == null || b.connector_id == null || String(connectorId) !== String(b.connector_id)) return false;
  const ag1 = agencyFromTransferNumber(a.transferNumber);
  const ag2 = agencyFromTransferNumber(b.transfer_number);
  return !ag1 || !ag2 || ag1 === ag2;
}

export function findDuplicateBankAccounts<T extends ExistingAccountKey>(
  accounts: NewAccountKey[],
  connectorId: number | string | null,
  existing: T[],
): T[] {
  return existing.filter((b) => accounts.some((a) => isSameBankAccount(a, connectorId, b)));
}
