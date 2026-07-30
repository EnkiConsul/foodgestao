import { describe, it, expect } from "vitest";
import {
  isFullyPaid,
  computeDisplayStatus,
  isRealized,
  signedEffect,
  runningBalance,
  computePeriodTotals,
  statusChangePatch,
  parseYmd,
  type TxLike,
} from "./balance";

const today = new Date(2026, 6, 20, 12, 0, 0); // 20/Jul/2026

function tx(over: Partial<TxLike>): TxLike {
  return {
    amount: 100,
    amount_paid: 0,
    transaction_type: "saida",
    transaction_date: "2026-07-10",
    due_date: "2026-07-15",
    payment_date: null,
    status: "pendente",
    ...over,
  };
}

describe("parseYmd", () => {
  it("parses yyyy-MM-dd to end-of-day local", () => {
    const d = parseYmd("2026-07-20")!;
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(6);
    expect(d.getDate()).toBe(20);
    expect(d.getHours()).toBe(23);
  });
  it("returns null for invalid input", () => {
    expect(parseYmd(null)).toBeNull();
    expect(parseYmd("")).toBeNull();
    expect(parseYmd("not-a-date")).toBeNull();
  });
});

describe("isFullyPaid", () => {
  it("true when paid >= amount", () => {
    expect(isFullyPaid({ amount: 100, amount_paid: 100 })).toBe(true);
    expect(isFullyPaid({ amount: 100, amount_paid: 150 })).toBe(true);
  });
  it("tolerates sub-cent float noise", () => {
    expect(isFullyPaid({ amount: 100, amount_paid: 99.997 })).toBe(true);
  });
  it("false when partial", () => {
    expect(isFullyPaid({ amount: 100, amount_paid: 99.5 })).toBe(false);
    expect(isFullyPaid({ amount: 100, amount_paid: 0 })).toBe(false);
  });
});

describe("computeDisplayStatus (com due_date)", () => {
  it("pago quando totalmente quitado", () => {
    expect(computeDisplayStatus(tx({ amount_paid: 100 }), today)).toBe("pago");
  });
  it("atrasado quando due_date < hoje e não pago", () => {
    expect(computeDisplayStatus(tx({ due_date: "2026-07-10" }), today)).toBe("atrasado");
  });
  it("a_vencer quando due_date futuro", () => {
    expect(computeDisplayStatus(tx({ due_date: "2026-08-01" }), today)).toBe("a_vencer");
  });
  it("a_vencer quando due_date = hoje (fim do dia)", () => {
    expect(computeDisplayStatus(tx({ due_date: "2026-07-20" }), today)).toBe("a_vencer");
  });
  it("pago prevalece mesmo com due_date passado", () => {
    expect(
      computeDisplayStatus(tx({ due_date: "2026-07-10", amount_paid: 100 }), today),
    ).toBe("pago");
  });
});

describe("computeDisplayStatus (sem due_date)", () => {
  it("confirmado => pago", () => {
    expect(
      computeDisplayStatus(tx({ due_date: null, status: "confirmado" }), today),
    ).toBe("pago");
  });
  it("pendente com transaction_date passada => atrasado", () => {
    expect(
      computeDisplayStatus(tx({ due_date: null, transaction_date: "2026-07-10" }), today),
    ).toBe("atrasado");
  });
  it("pendente com transaction_date futura => a_vencer", () => {
    expect(
      computeDisplayStatus(tx({ due_date: null, transaction_date: "2026-08-01" }), today),
    ).toBe("a_vencer");
  });
});

describe("isRealized / signedEffect", () => {
  it("confirmado sempre realiza", () => {
    expect(isRealized(tx({ status: "confirmado" }))).toBe(true);
  });
  it("com due_date exige quitação total", () => {
    expect(isRealized(tx({ amount_paid: 100 }))).toBe(true);
    expect(isRealized(tx({ amount_paid: 50 }))).toBe(false);
  });
  it("pendente sem due_date não realiza", () => {
    expect(isRealized(tx({ due_date: null }))).toBe(false);
  });
  it("receita soma, despesa subtrai, transferência = 0", () => {
    expect(signedEffect(tx({ transaction_type: "entrada" }))).toBe(100);
    expect(signedEffect(tx({ transaction_type: "saida" }))).toBe(-100);
    expect(signedEffect(tx({ transaction_type: "transferencia" }))).toBe(0);
  });
});

describe("runningBalance", () => {
  it("acumula somente lançamentos realizados", () => {
    const txs = [
      tx({ status: "confirmado", transaction_type: "entrada", amount: 500 }),
      tx({ transaction_type: "saida", amount: 100, amount_paid: 100 }), // pago
      tx({ transaction_type: "saida", amount: 50 }), // pendente
      tx({ status: "confirmado", transaction_type: "saida", amount: 30 }),
    ];
    const rows = runningBalance(txs, 1000);
    expect(rows.map((r) => r.runningBalance)).toEqual([1500, 1400, 1400, 1370]);
  });

  it("respeita saldo anterior negativo", () => {
    const rows = runningBalance(
      [tx({ status: "confirmado", transaction_type: "entrada", amount: 200 })],
      -500,
    );
    expect(rows[0].runningBalance).toBe(-300);
  });
});

describe("computePeriodTotals", () => {
  const dataset: TxLike[] = [
    tx({ transaction_type: "entrada", amount: 1000, status: "confirmado", due_date: null }),
    tx({ transaction_type: "entrada", amount: 500, due_date: "2026-08-15" }), // a receber
    tx({ transaction_type: "saida", amount: 300, amount_paid: 300 }), // paga
    tx({ transaction_type: "saida", amount: 200, due_date: "2026-07-10" }), // atrasada
    tx({ transaction_type: "saida", amount: 400, amount_paid: 100, due_date: "2026-08-01" }), // parcial
  ];

  it("soma totais realizados e pendentes corretamente", () => {
    const t = computePeriodTotals(dataset, today, 100);
    expect(t.receitas).toBe(1000); // só a confirmada
    expect(t.despesas).toBe(300); // só a paga
    expect(t.aReceber).toBe(500);
    expect(t.aPagar).toBe(200 + 300); // atrasada + restante parcial
    expect(t.atrasadas).toBe(1);
    expect(t.allReceitas).toBe(1500);
    expect(t.allDespesas).toBe(900);
    expect(t.saldoPeriodo).toBe(600);
    expect(t.saldoAcumulado).toBe(700);
  });

  it("não considera pago negativo em aPagar", () => {
    const t = computePeriodTotals(
      [tx({ transaction_type: "saida", amount: 100, amount_paid: 150 })],
      today,
    );
    expect(t.aPagar).toBe(0);
  });
});

describe("statusChangePatch", () => {
  it("confirmado preenche payment_date e amount_paid quando vazios", () => {
    const p = statusChangePatch(
      { amount: 100, amount_paid: 0, payment_date: null, status: "pendente" },
      "confirmado",
      "2026-07-20",
    );
    expect(p).toEqual({ status: "confirmado", payment_date: "2026-07-20", amount_paid: 100 });
  });

  it("confirmado preserva payment_date/amount_paid existentes", () => {
    const p = statusChangePatch(
      { amount: 100, amount_paid: 50, payment_date: "2026-07-01", status: "pendente" },
      "confirmado",
      "2026-07-20",
    );
    expect(p).toEqual({ status: "confirmado" });
  });

  it("pendente zera pagamento", () => {
    const p = statusChangePatch(
      { amount: 100, amount_paid: 100, payment_date: "2026-07-01", status: "confirmado" },
      "pendente",
      "2026-07-20",
    );
    expect(p).toEqual({ status: "pendente", amount_paid: 0, payment_date: null });
  });

  it("cancelado zera pagamento", () => {
    const p = statusChangePatch(
      { amount: 100, amount_paid: 100, payment_date: "2026-07-01", status: "confirmado" },
      "cancelado",
      "2026-07-20",
    );
    expect(p).toEqual({ status: "cancelado", amount_paid: 0, payment_date: null });
  });
});

import { belongsToRegime, computePeriodTotals as ppt, runningBalance as rb } from "./balance";

describe("regime caixa vs competência", () => {
  const cardPurchase = {
    amount: 200, amount_paid: 200, transaction_type: "saida" as const,
    transaction_date: "2026-07-05", due_date: null, status: "confirmado" as const,
    credit_card_invoice_id: "inv-1",
  };
  const invoicePayment = {
    amount: 200, amount_paid: 200, transaction_type: "saida" as const,
    transaction_date: "2026-07-15", due_date: "2026-07-15", status: "confirmado" as const,
    is_invoice_payment: true,
  };
  const cashExpense = {
    amount: 50, amount_paid: 50, transaction_type: "saida" as const,
    transaction_date: "2026-07-10", due_date: null, status: "confirmado" as const,
  };

  it("belongsToRegime: caixa exclui compra no cartão, competência exclui pagamento de fatura", () => {
    expect(belongsToRegime(cardPurchase, "caixa")).toBe(false);
    expect(belongsToRegime(cardPurchase, "competencia")).toBe(true);
    expect(belongsToRegime(invoicePayment, "caixa")).toBe(true);
    expect(belongsToRegime(invoicePayment, "competencia")).toBe(false);
    expect(belongsToRegime(cashExpense, "caixa")).toBe(true);
    expect(belongsToRegime(cashExpense, "competencia")).toBe(true);
  });

  it("runningBalance em caixa: compra não sai, pagamento da fatura sai", () => {
    const rows = rb([cardPurchase, cashExpense, invoicePayment], 1000, "caixa");
    expect(rows.map((r) => r.runningBalance)).toEqual([1000, 950, 750]);
  });

  it("runningBalance em competência: compra sai imediatamente, pagamento é ignorado", () => {
    const rows = rb([cardPurchase, cashExpense, invoicePayment], 1000, "competencia");
    expect(rows.map((r) => r.runningBalance)).toEqual([800, 750, 750]);
  });

  it("computePeriodTotals distingue regimes", () => {
    const today = new Date(2026, 6, 20);
    const caixa = ppt([cardPurchase, cashExpense, invoicePayment], today, 0, "caixa");
    const comp = ppt([cardPurchase, cashExpense, invoicePayment], today, 0, "competencia");
    expect(caixa.despesas).toBe(250); // 50 + 200 (pagto)
    expect(comp.despesas).toBe(250);  // 200 (compra) + 50
  });
});
