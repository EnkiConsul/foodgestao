/**
 * Descrições de lançamentos de cartão de crédito do Open Finance.
 *
 * Em faturas de cartão vários bancos não mandam o estabelecimento: no lugar do
 * nome vem o código da operação (`CREDITO_A_VISTA`, `PAGAMENTO_RECEBIDO`...),
 * com `merchant` e `paymentData` nulos. Aqui traduzimos o código para um rótulo
 * legível e complementamos com o que existe de fato no dado bruto (categoria do
 * provedor e final do cartão).
 */

/** Códigos de operação conhecidos → rótulo em português. */
const OPERATION_LABELS: Record<string, string> = {
  CREDITO_A_VISTA: "Compra no crédito à vista",
  COMPRA_A_VISTA: "Compra no crédito à vista",
  CREDITO_PARCELADO: "Compra parcelada",
  COMPRA_PARCELADA: "Compra parcelada",
  PARCELA: "Compra parcelada",
  PARCELAMENTO_FATURA: "Parcelamento da fatura",
  PAGAMENTO_RECEBIDO: "Pagamento da fatura",
  "PAGAMENTO RECEBIDO": "Pagamento da fatura",
  PAGAMENTO_FATURA: "Pagamento da fatura",
  TARIFA: "Tarifa do cartão",
  ANUIDADE: "Anuidade do cartão",
  ENCARGOS: "Encargos do cartão",
  JUROS: "Juros do cartão",
  JUROS_ROTATIVO: "Juros do rotativo",
  MULTA: "Multa por atraso",
  IOF: "IOF",
  ESTORNO: "Estorno",
  CREDITO_ROTATIVO: "Crédito rotativo",
  SAQUE: "Saque com o cartão",
  SAQUE_CREDITO: "Saque com o cartão",
  TAXAS: "Taxas do cartão",
  OUTROS: "Outros lançamentos do cartão",
  OUTROS_CREDITOS: "Outros créditos do cartão",
};

/** Categorias do Pluggy mais comuns em cartão → português. */
const CATEGORY_LABELS: Record<string, string> = {
  "digital services": "Serviços digitais",
  "online services": "Serviços online",
  "food and beverages": "Alimentação",
  "food and drinks": "Alimentação",
  supermarkets: "Supermercado",
  groceries: "Supermercado",
  restaurants: "Restaurantes",
  transportation: "Transporte",
  travel: "Viagem",
  shopping: "Compras",
  electronics: "Eletrônicos",
  health: "Saúde",
  pharmacy: "Farmácia",
  education: "Educação",
  entertainment: "Entretenimento",
  "gas stations": "Combustível",
  telecommunications: "Telecomunicações",
  services: "Serviços",
  taxes: "Impostos e taxas",
  "bank fees": "Tarifas bancárias",
  "credit card payment": "Pagamento de fatura",
};

function collapse(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function titleCase(value: string): string {
  const lower = collapse(value).toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

const CODE_RE = /^[A-Z0-9]+(?:[_ ][A-Z0-9]+)*$/;

/**
 * true quando o texto parece um código de operação (tudo em maiúsculas com
 * underscores) e não o nome de um estabelecimento.
 */
export function isCardOperationCode(description: string | null | undefined): boolean {
  const raw = collapse(String(description ?? "")).toUpperCase();
  if (!raw) return false;
  if (OPERATION_LABELS[raw]) return true;
  if (!raw.includes("_")) return false;
  return CODE_RE.test(raw);
}

/** Rótulo legível para o código de operação (ou o próprio texto humanizado). */
export function cardOperationLabel(description: string | null | undefined): string {
  const raw = collapse(String(description ?? ""));
  if (!raw) return "";
  const key = raw.toUpperCase();
  if (OPERATION_LABELS[key]) return OPERATION_LABELS[key];
  if (key.includes("_")) return titleCase(key.replace(/_/g, " "));
  return raw;
}

/** true quando a descrição do banco traz nome de estabelecimento. */
export function hasMerchantName(description: string | null | undefined): boolean {
  const raw = collapse(String(description ?? ""));
  if (!raw) return false;
  return !isCardOperationCode(raw);
}

export function cardCategoryLabel(category: string | null | undefined): string | null {
  const raw = collapse(String(category ?? ""));
  if (!raw) return null;
  return CATEGORY_LABELS[raw.toLowerCase()] ?? titleCase(raw);
}

interface CardRawShape {
  category?: unknown;
  creditCardMetadata?: { cardNumber?: unknown } | null;
}

/** Final do cartão informado pelo banco (descarta placeholders como `0000`). */
export function cardLast4FromRaw(raw: unknown): string | null {
  const value = (raw as CardRawShape | null)?.creditCardMetadata?.cardNumber;
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits || /^0+$/.test(digits)) return null;
  return digits.slice(-4);
}

/**
 * Descrição final para exibição de uma linha do extrato.
 *
 * - Estabelecimento informado: só limpa o espaçamento excessivo do banco
 *   (`PONTO DA CARNE      GOIANIA   BR` → `PONTO DA CARNE • GOIANIA`).
 * - Só o código da operação: rótulo legível + categoria + final do cartão.
 */
export function formatProviderDescription(
  description: string | null | undefined,
  raw?: unknown,
): string {
  const original = String(description ?? "");
  if (!collapse(original)) return "";

  if (hasMerchantName(original)) return cleanMerchantSpacing(original);

  const parts = [cardOperationLabel(original)];
  const category = cardCategoryLabel((raw as CardRawShape | null)?.category as string | null);
  if (category) parts.push(category);
  const last4 = cardLast4FromRaw(raw);
  if (last4) parts.push(`cartão ••••${last4}`);
  return parts.filter(Boolean).join(" • ");
}

/**
 * Bancos alinham a descrição em colunas de largura fixa
 * (`ESTABELECIMENTO      CIDADE     BR`). Trocamos os blocos de espaços por
 * separador e descartamos o sufixo de país.
 */
export function cleanMerchantSpacing(description: string): string {
  const blocks = description
    .split(/\s{2,}/)
    .map((b) => collapse(b))
    .filter(Boolean)
    .filter((b, index, arr) => !(index === arr.length - 1 && /^(BR|BRA|BRASIL)$/i.test(b)));
  if (blocks.length === 0) return collapse(description);
  return blocks.join(" • ");
}
