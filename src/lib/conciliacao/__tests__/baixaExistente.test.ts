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
