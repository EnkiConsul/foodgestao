/**
 * Estabelecimento (fornecedor) nos lançamentos de fatura de cartão.
 *
 * A lógica de fato vive em `cardLine.ts` (classificação única da linha de
 * cartão, compartilhada por conciliação, extrato e sincronização). Este módulo
 * mantém as funções usadas pelas telas, delegando para o classificador.
 */

import {
  classifyCardLine,
  isCardBillMovement,
  isCardChargeLine,
} from "@/lib/conciliacao/cardLine";

export interface CardMerchant {
  name: string | null;
  city: string | null;
}

const EMPTY: CardMerchant = { name: null, city: null };

/**
 * true quando a linha é movimento da própria fatura (pagamento, estorno,
 * encerramento de dívida) ou encargo do cartão — casos sem fornecedor.
 */
export function isCardBillPayment(
  description: string | null | undefined,
  category?: string | null,
): boolean {
  return isCardBillMovement(description, category) || isCardChargeLine(description, category);
}

/**
 * Separa nome do estabelecimento e cidade na descrição de cartão.
 * Devolve nome nulo quando a linha não é compra (código de operação,
 * pagamento de fatura, encargo).
 */
export function merchantFromCardDescription(
  description: string | null | undefined,
  category?: string | null,
): CardMerchant {
  const line = classifyCardLine({ description, category });
  if (line.kind !== "compra" || !line.merchant) return EMPTY;
  return { name: line.merchant, city: line.city };
}

/**
 * Extrai o estabelecimento usando primeiro o espaçamento em colunas do texto
 * bruto do banco. Ex.: `PONTO DA CARNE   GOIANIA   BR`.
 */
export function merchantFromCardRaw(
  description: string | null | undefined,
  raw?: unknown,
  category?: string | null,
): CardMerchant {
  const line = classifyCardLine({ description, raw, category });
  if (line.kind !== "compra" || !line.merchant) return EMPTY;
  return { name: line.merchant, city: line.city };
}
