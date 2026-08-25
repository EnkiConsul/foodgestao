type AccountLabelInput = {
  name?: string | null;
  agency?: string | null;
  account_number?: string | null;
  bank_slug?: string | null;
  account_type?: string | null;
};

const accountTypeLabels: Record<string, string> = {
  corrente: "Corrente",
  poupanca: "Poupança",
  investimento: "Investimento",
  cartao_credito: "Cartão de Crédito",
  dinheiro: "Dinheiro",
  outro: "Outro",
};

export function getAccountPaymentLabel(account: AccountLabelInput): string {
  const name = account.name?.trim() || "Conta financeira";
  const agency = account.agency?.trim();
  const accountNumber = account.account_number?.trim();
  const accountType = account.account_type ? accountTypeLabels[account.account_type] : null;
  const details = [
    accountType,
    agency ? `Ag. ${agency}` : null,
    accountNumber ? `Conta ${accountNumber}` : null,
  ].filter((detail): detail is string => Boolean(detail));

  if (details.length > 0) return `${name} • ${details.join(" · ")}`;
  if (account.bank_slug) return `${name} • ${account.bank_slug.toUpperCase()}`;
  return name;
}