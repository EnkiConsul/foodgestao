import { describe, expect, it } from "vitest";
import { compareBankLedger, isBankReferenceDiscarded } from "@/lib/transactions/balance";

describe("compareBankLedger", () => {
  it("não aponta divergência quando não há saldo do banco", () => {
    const r = compareBankLedger(1200.5, null);
    expect(r).toEqual({ ledger: 1200.5, bank: null, diff: null, divergent: false });
  });

  it("ignora diferenças de arredondamento", () => {
    expect(compareBankLedger(100, 100.004).divergent).toBe(false);
  });

  it("aponta divergência com o sinal do banco menos o razão", () => {
    const r = compareBankLedger(1000, 1250.75);
    expect(r.diff).toBe(250.75);
    expect(r.divergent).toBe(true);

    const negativo = compareBankLedger(1000, 900);
    expect(negativo.diff).toBe(-100);
    expect(negativo.divergent).toBe(true);
  });

  it("trata razão nulo como zero", () => {
    const r = compareBankLedger(null, 50);
    expect(r.ledger).toBe(0);
    expect(r.diff).toBe(50);
  });
});

describe("isBankReferenceDiscarded", () => {
  it("reconhece a referência descartada pela sincronização", () => {
    expect(isBankReferenceDiscarded("open_finance_descartado")).toBe(true);
  });

  it("não descarta a referência normal do Open Finance", () => {
    expect(isBankReferenceDiscarded("open_finance")).toBe(false);
    expect(isBankReferenceDiscarded(null)).toBe(false);
    expect(isBankReferenceDiscarded(undefined)).toBe(false);
  });
});
