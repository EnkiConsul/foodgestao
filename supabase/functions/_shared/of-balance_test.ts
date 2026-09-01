import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { resolveOpenFinanceBalance } from "./of-balance.ts";

Deno.test("santander: negativo sem descoberto não semeia saldo", () => {
  const r = resolveOpenFinanceBalance({
    type: "BANK",
    subtype: "CHECKING_ACCOUNT",
    balance: -53.26,
    bankData: {
      closingBalance: -53.26,
      overdraftContractedLimit: 0,
      overdraftUsedLimit: 0,
      unarrangedOverdraftAmount: 0,
    },
  });
  assertEquals(r.reported, -53.26);
  assertEquals(r.seed, null);
  assertEquals(r.implausible, true);
});

Deno.test("negativo com cheque especial contratado é aceito", () => {
  const r = resolveOpenFinanceBalance({
    type: "BANK",
    subtype: "CHECKING_ACCOUNT",
    balance: -120,
    bankData: { overdraftContractedLimit: 1000, overdraftUsedLimit: 120, unarrangedOverdraftAmount: 0 },
  });
  assertEquals(r.seed, -120);
  assertEquals(r.implausible, false);
});

Deno.test("saldo positivo é sempre aceito", () => {
  const r = resolveOpenFinanceBalance({ type: "BANK", subtype: "CHECKING_ACCOUNT", balance: 1558.67 });
  assertEquals(r.seed, 1558.67);
  assertEquals(r.implausible, false);
});

Deno.test("cartão de crédito não é afetado pela regra", () => {
  const r = resolveOpenFinanceBalance({ type: "CREDIT", subtype: "CREDIT_CARD", balance: -300 });
  assertEquals(r.seed, -300);
  assertEquals(r.implausible, false);
});

Deno.test("sem saldo reportado", () => {
  const r = resolveOpenFinanceBalance({ type: "BANK", subtype: "CHECKING_ACCOUNT", balance: null });
  assertEquals(r.reported, null);
  assertEquals(r.seed, null);
  assertEquals(r.implausible, false);
});

Deno.test("negativo com aplicação automática que cobre o descoberto usa o saldo disponível", () => {
  const r = resolveOpenFinanceBalance({
    type: "BANK",
    subtype: "CHECKING_ACCOUNT",
    balance: -53.26,
    bankData: { closingBalance: -53.26, automaticallyInvestedBalance: 100.5 },
  });
  assertEquals(r.reported, 47.24);
  assertEquals(r.rawReported, -53.26);
  assertEquals(r.seed, 47.24);
  assertEquals(r.implausible, false);
  assertEquals(r.source, "open_finance");
});

Deno.test("santander: aplicação automática insuficiente mantém descarte", () => {
  const r = resolveOpenFinanceBalance({
    type: "BANK",
    subtype: "CHECKING_ACCOUNT",
    balance: -53.26,
    bankData: { closingBalance: -53.26, automaticallyInvestedBalance: 0.08 },
  });
  assertEquals(r.seed, null);
  assertEquals(r.implausible, true);
  assertEquals(r.source, "open_finance_descartado");
});
