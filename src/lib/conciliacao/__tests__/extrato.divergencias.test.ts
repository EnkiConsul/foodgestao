import { describe, expect, it } from "vitest";
import { buildExtratoConciliacao, type ExtratoStagingLike, type ExtratoTxLike } from "@/lib/conciliacao/extrato";

const st = (over: Partial<ExtratoStagingLike> & { id: string }): ExtratoStagingLike => ({
  date: "2026-03-01",
  description: "PAGAMENTO",
  amount: 100,
  status: "pending",
  type: "DEBIT",
  ...over,
});

const tx = (over: Partial<ExtratoTxLike> & { id: string }): ExtratoTxLike => ({
  description: "PAGAMENTO",
  amount: 100,
  ...over,
});

describe("divergências do extrato", () => {
  it("linha pendente sem lançamento entra nas divergências", () => {
    const m = buildExtratoConciliacao({ staging: [st({ id: "a" })], transactions: [] });
    expect(m.divergencias.map((d) => d.stagingId)).toEqual(["a"]);
  });

  it("duplicada e ignorada não são divergência (decisão já tomada)", () => {
    const m = buildExtratoConciliacao({
      staging: [st({ id: "dup", status: "duplicate" }), st({ id: "ign", status: "ignored" })],
      transactions: [],
    });
    expect(m.divergencias).toHaveLength(0);
  });

  it("diferença real de valor entra mesmo quando conciliada", () => {
    const m = buildExtratoConciliacao({
      staging: [st({ id: "a", status: "confirmed", amount: 100 })],
      transactions: [tx({ id: "t1", pluggy_staging_transaction_id: "a", amount: 80 })],
    });
    expect(m.divergencias.map((d) => d.stagingId)).toEqual(["a"]);
    expect(m.divergencias[0].divergenteValor).toBe(true);
  });

  it("rateio que soma o valor da linha do banco não é divergência", () => {
    const m = buildExtratoConciliacao({
      staging: [st({ id: "a", status: "confirmed", amount: 100 })],
      transactions: [
        tx({ id: "t1", pluggy_staging_transaction_id: "a", amount: 60 }),
        tx({ id: "t2", pluggy_staging_transaction_id: "a", amount: 40 }),
      ],
    });
    expect(m.divergencias).toHaveLength(0);
  });
});
