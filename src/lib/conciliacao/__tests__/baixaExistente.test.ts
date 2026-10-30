import { describe, it, expect } from "vitest";
import { pontuarCandidato, ranquearCandidatos, rotuloPrazo, type CandidatoBaixa } from "../baixaExistente";

const base: CandidatoBaixa = {
  staging_id: "s1", transaction_id: "t1", description: "Aluguel loja", amount: 1500, amount_paid: 0,
  due_date: "2026-08-15", transaction_date: "2026-08-01", account_id: "a1", contact_id: "c1",
  contact_name: "Imobiliária Sol", category_id: null, installment_number: 2, installment_total: 6,
  is_recurring: false, parent_transaction_id: "p1",
};

describe("baixa de lançamento existente", () => {
  it("não descarta pagamento com 74 dias de atraso", () => {
    const r = pontuarCandidato(base, { date: "2026-10-28", description: "PIX Imobiliaria Sol", contactId: "c1", accountId: "a1" });
    expect(r.diasDiferenca).toBe(74);
    expect(r.confianca).toBe("alta");
  });

  it("aceita pagamento antecipado", () => {
    expect(rotuloPrazo(-5)).toBe("pago 5 dias antes do vencimento");
    expect(rotuloPrazo(74)).toBe("pago com 74 dias de atraso");
  });

  it("prioriza o mesmo fornecedor sobre data mais próxima", () => {
    const outro = { ...base, transaction_id: "t2", contact_id: "c9", contact_name: "Outro", description: "Diversos", due_date: "2026-10-28" };
    const r = ranquearCandidatos([outro, base], () => ({ date: "2026-10-28", description: "Imobiliaria Sol", contactId: "c1" }));
    expect(r.s1[0].transaction_id).toBe("t1");
  });
});

import { pontuarCandidato as p2, ranquearCandidatos as r2 } from "../baixaExistente";
describe("valor diferente sem limite", () => {
  const base = { staging_id: "s", transaction_id: "t", description: "Aluguel loja", amount: 3000, amount_paid: 0, due_date: "2026-01-10", transaction_date: null, account_id: null, contact_id: "c1", contact_name: "Imobiliária", category_id: null, installment_number: null, installment_total: null, is_recurring: true, parent_transaction_id: null };
  it("juros grandes e 200 dias de atraso continuam sugeridos pelo mesmo fornecedor", () => {
    const r = p2(base, { date: "2026-07-29", description: "PIX aluguel", contactId: "c1", valor: 4500 });
    expect(r.diferenca).toBe(1500);
    expect(r.semEvidencia).toBe(false);
  });
  it("desconto fica negativo", () => {
    expect(p2(base, { date: "2026-01-10", description: "aluguel", valor: 2900 }).diferenca).toBe(-100);
  });
  it("valor diferente sem nada em comum não é sugerido", () => {
    const out = r2([base], () => ({ date: "2026-01-10", description: "Mercado XYZ", valor: 50 }));
    expect(out["s"]).toBeUndefined();
  });
});
