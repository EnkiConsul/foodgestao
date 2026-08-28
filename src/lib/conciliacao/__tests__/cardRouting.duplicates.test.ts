import { describe, expect, it } from "vitest";
import { cardBillId, findCardDuplicateIds, signedRowAmount } from "@/lib/conciliacao/cardRouting";

describe("signedRowAmount", () => {
  it("mantém o sinal do banco em conta bancária", () => {
    expect(signedRowAmount({ amount: 1000, type: "CREDIT", isCardAccount: false })).toBe(1000);
    expect(signedRowAmount({ amount: -250, type: "DEBIT", isCardAccount: false })).toBe(-250);
  });

  it("compra no cartão fica negativa e pagamento de fatura positivo", () => {
    expect(signedRowAmount({ amount: 34.9, type: "DEBIT", isCardAccount: true })).toBe(-34.9);
    expect(signedRowAmount({ amount: -146.68, type: "CREDIT", isCardAccount: true })).toBe(146.68);
  });
});

describe("cardBillId", () => {
  it("extrai o billId do dado bruto", () => {
    expect(cardBillId({ creditCardMetadata: { billId: " bill-1 " } })).toBe("bill-1");
    expect(cardBillId({})).toBeNull();
    expect(cardBillId(null)).toBeNull();
  });
});

const bill = { creditCardMetadata: { billId: "bill-1" } };
const isCard = () => true;

describe("findCardDuplicateIds", () => {
  it("marca apenas a versão antiga do reenvio", () => {
    const dupes = findCardDuplicateIds(
      [
        { id: "old", date: "2026-07-30", amount: -146.68, status: "pending", pluggy_account_id: "a1", raw: bill, created_at: "2026-08-01T00:00:00Z" },
        { id: "new", date: "2026-07-30", amount: -146.68, status: "pending", pluggy_account_id: "a1", raw: bill, created_at: "2026-08-20T00:00:00Z" },
      ],
      isCard,
    );
    expect([...dupes]).toEqual(["old"]);
  });

  it("ignora linhas não pendentes, outras faturas e contas bancárias", () => {
    const rows = [
      { id: "a", date: "2026-07-30", amount: -146.68, status: "confirmed", pluggy_account_id: "a1", raw: bill, created_at: "1" },
      { id: "b", date: "2026-07-30", amount: -146.68, status: "pending", pluggy_account_id: "a1", raw: bill, created_at: "2" },
      { id: "c", date: "2026-07-30", amount: -146.68, status: "pending", pluggy_account_id: "a1", raw: { creditCardMetadata: { billId: "bill-2" } }, created_at: "3" },
    ];
    expect(findCardDuplicateIds(rows, isCard).size).toBe(0);
    expect(findCardDuplicateIds(rows, () => false).size).toBe(0);
  });
});
