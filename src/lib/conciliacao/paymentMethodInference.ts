/**
 * Inferência da forma de pagamento em lançamentos importados via Open Finance.
 *
 * Fonte primária: `raw.paymentData.paymentMethod` informado pelo banco.
 * Quando o banco devolve OTHER/nulo, caímos em palavras-chave da descrição.
 * Sem confiança suficiente retornamos null — é melhor deixar o campo vazio
 * do que sugerir uma forma errada.
 */

export type PaymentMethodKey =
  | "pix"
  | "boleto"
  | "ted"
  | "credito"
  | "debito"
  | "dinheiro"
  | "ifood"
  | "cheque";

export interface InferencePaymentRow {
  description?: string | null;
  category_pluggy?: string | null;
  raw?: unknown;
}

/** Remove acentos e normaliza para caixa alta, facilitando o casamento textual. */
export function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

function bankPaymentMethod(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const paymentData = (raw as { paymentData?: unknown }).paymentData;
  if (!paymentData || typeof paymentData !== "object") return null;
  const method = (paymentData as { paymentMethod?: unknown }).paymentMethod;
  return typeof method === "string" ? method.toUpperCase() : null;
}

/** Chave canônica da forma de pagamento, ou null quando não há sinal confiável. */
export function inferPaymentMethodKey(row: InferencePaymentRow): PaymentMethodKey | null {
  const text = normalizeText(
    [row.description ?? "", row.category_pluggy ?? ""].join(" "),
  );

  // Cartão tem prioridade sobre o meio informado pelo banco: pagamentos de
  // fatura chegam como OTHER/PIX mas o texto identifica o cartão.
  if (/CARTAO\s*(DE\s*)?CREDITO|FATURA\s*(DO\s*)?CARTAO/.test(text)) return "credito";
  if (/CARTAO\s*(DE\s*)?DEBITO|COMPRA\s*(COM\s*)?CARTAO|DEBITO\s*AUTOMATICO/.test(text)) return "debito";
  if (/IFOOD/.test(text)) return "ifood";
  if (/CHEQUE/.test(text)) return "cheque";

  const bank = bankPaymentMethod(row.raw);
  switch (bank) {
    case "PIX":
      return "pix";
    case "BOLETO":
      return "boleto";
    case "TED":
    case "DOC":
    case "TRANSFER":
      return "ted";
    case "CREDIT_CARD":
    case "CARD":
      return "credito";
    case "DEBIT_CARD":
      return "debito";
    case "CASH":
      return "dinheiro";
    default:
      break;
  }

  if (/\bPIX\b/.test(text)) return "pix";
  if (/BOLETO/.test(text)) return "boleto";
  if (/\bTED\b|\bDOC\b|TRANSFERENCIA/.test(text)) return "ted";
  if (/DINHEIRO|\bSAQUE\b|DEPOSITO EM DINHEIRO/.test(text)) return "dinheiro";

  return null;
}

const KEY_PATTERNS: Record<PaymentMethodKey, RegExp> = {
  pix: /\bPIX\b/,
  boleto: /BOLETO/,
  ted: /\bTED\b|\bDOC\b|TRANSFERENCIA/,
  credito: /CARTAO.*CREDITO|CREDITO/,
  debito: /CARTAO.*DEBITO|DEBITO/,
  dinheiro: /DINHEIRO|ESPECIE/,
  ifood: /IFOOD/,
  cheque: /CHEQUE/,
};

/** Resolve o id da forma de pagamento cadastrada na empresa a partir da chave. */
export function matchPaymentMethodId(
  key: PaymentMethodKey | null,
  paymentMethods: { id: string; name: string }[],
): string | null {
  if (!key) return null;
  const pattern = KEY_PATTERNS[key];
  const match = paymentMethods.find((pm) => pattern.test(normalizeText(pm.name ?? "")));
  return match?.id ?? null;
}

/** Atalho: infere e resolve o id em uma única chamada. */
export function suggestPaymentMethodId(
  row: InferencePaymentRow,
  paymentMethods: { id: string; name: string }[],
): string | null {
  return matchPaymentMethodId(inferPaymentMethodKey(row), paymentMethods);
}
