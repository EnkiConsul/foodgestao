type AccountLabelInput = {
  name?: string | null;
  account_number?: string | null;
  bank_slug?: string | null;
};

export function getAccountPaymentLabel(account: AccountLabelInput): string {
  const name = account.name?.trim() || "Conta financeira";
  const accountNumber = account.account_number?.trim();
  if (accountNumber) return `${name} • conta ${accountNumber}`;
  if (account.bank_slug) return `${name} • ${account.bank_slug.toUpperCase()}`;
  return name;
}