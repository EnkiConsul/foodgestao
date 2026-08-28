/**
 * Descrições de lançamentos de cartão de crédito do Open Finance.
 *
 * Em faturas de cartão vários bancos não mandam o estabelecimento: no lugar do
 * nome vem o código da operação (`CREDITO_A_VISTA`, `PAGAMENTO_RECEBIDO`...),
 * com `merchant` e `paymentData` nulos. Aqui traduzimos o código para um rótulo
 * legível e complementamos com o que existe de fato no dado bruto (categoria do
 * provedor e final do cartão).
 */

import { cardLineKindLabel, classifyCardLine } from "@/lib/conciliacao/cardLine";

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

/**
 * MCC (ramo do estabelecimento) informado na fatura. Não identifica a loja,
 * mas é a única pista quando o banco não manda o nome.
 */
const MCC_LABELS: Record<string, string> = {
  "4111": "Transporte urbano",
  "4121": "Táxi/aplicativo de transporte",
  "4812": "Telefonia",
  "4814": "Telecomunicações",
  "4899": "TV/streaming por assinatura",
  "5411": "Supermercado",
  "5412": "Mercearia",
  "5499": "Alimentos e conveniência",
  "5541": "Combustível",
  "5542": "Combustível (autoatendimento)",
  "5812": "Restaurante",
  "5813": "Bar",
  "5814": "Fast-food",
  "5815": "Mídia digital",
  "5816": "Jogos digitais",
  "5817": "Aplicativos",
  "5818": "Serviços digitais",
  "5912": "Farmácia",
  "5942": "Livraria",
  "5968": "Assinatura recorrente",
  "7372": "Serviços de software",
  "7997": "Academia/clube",
  "8062": "Hospital",
  "8071": "Laboratório",
  "8099": "Serviços de saúde",
};

export function cardMccLabel(mcc: unknown): string | null {
  const digits = String(mcc ?? "").replace(/\D/g, "");
  if (!digits) return null;
  return MCC_LABELS[digits] ?? null;
}

interface CardRawShape {
  description?: unknown;
  descriptionRaw?: unknown;
  category?: unknown;
  creditCardMetadata?: { cardNumber?: unknown; payeeMCC?: unknown } | null;
}

/** Texto original enviado pelo banco para a linha de cartão. */
export function cardProviderDescription(
  description: string | null | undefined,
  raw?: unknown,
): string {
  const providerRaw = raw as CardRawShape | null;
  return collapse(String(providerRaw?.descriptionRaw ?? providerRaw?.description ?? description ?? ""));
}

/** Final do cartão informado pelo banco (descarta placeholders como `0000`). */
export function cardLast4FromRaw(raw: unknown): string | null {
  const value = (raw as CardRawShape | null)?.creditCardMetadata?.cardNumber;
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits || /^0+$/.test(digits)) return null;
  return digits.slice(-4);
}


/**
 * Descrição exibida = texto do banco, sem reescrita.
 *
 * A única normalização é colapsar os blocos de espaço com que o banco alinha as
 * colunas (`PONTO DA CARNE      GOIANIA   BR` → `PONTO DA CARNE GOIANIA BR`),
 * para o texto bater com o extrato do cartão.
 */
export function formatProviderDescription(
  description: string | null | undefined,
  raw?: unknown,
): string {
  return cardProviderDescription(description, raw);
}

/**
 * Informação auxiliar padronizada da linha de cartão (segunda linha/tooltip),
 * igual para todos os bancos: tipo da linha (pagamento da fatura, encargo ou
 * tradução do código genérico), parcela, cidade, ramo (MCC/categoria) e final
 * do cartão. Nunca substitui a descrição do banco.
 */
export function cardHintLabel(
  description: string | null | undefined,
  raw?: unknown,
): string | null {
  const parts: string[] = [];
  const line = classifyCardLine({
    description,
    raw,
    category: (raw as CardRawShape | null)?.category as string | null,
  });

  const kind = cardLineKindLabel(line);
  if (kind) parts.push(kind);
  else if (line.kind === "sem_identificacao" && isCardOperationCode(line.text)) {
    const label = cardOperationLabel(line.text);
    if (label && label.toUpperCase() !== line.text.toUpperCase()) parts.push(label);
  }


  if (line.installment) parts.push(`Parcela ${line.installment.current}/${line.installment.total}`);
  if (line.city) parts.push(line.city);

  const meta = (raw as CardRawShape | null)?.creditCardMetadata ?? null;
  const mcc = cardMccLabel(meta?.payeeMCC);
  const category = cardCategoryLabel((raw as CardRawShape | null)?.category as string | null);
  if (mcc) parts.push(mcc);
  else if (category && line.kind !== "compra") parts.push(category);
  else if (category && line.kind === "compra" && !line.city) parts.push(category);

  const last4 = cardLast4FromRaw(raw);
  if (last4) parts.push(`cartão ••••${last4}`);

  return parts.length > 0 ? parts.join(" • ") : null;
}


