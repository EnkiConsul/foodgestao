import { describe, expect, it } from "vitest";
import {
  buildExtratoConciliacao,
  groupExtratoByDay,
  sideOf,
} from "@/lib/conciliacao/extrato";

const staging = [
  { id: "s1", date: "2026-01-02", description: "PIX RECEBIDO", amount: 1000, status: "confirmed" },
  { id: "s2", date: "2026-01-02", description: "COMPRA MERCADO", amount: -250, status: "confirmed" },
  { id: "s3", date: "2026-01-03", description: "TARIFA", amount: -30, status: "pending" },
  { id: "s4", date: "2026-01-03", description: "ESTORNO", amount: 45, status: "ignored" },
];

const transactions = [
  { id: "t1", pluggy_staging_transaction_id: "s1", description: "Venda balcão", amount: 1000, category_name: "Vendas" },
  { id: "t2", pluggy_staging_transaction_id: "s2", description: "Insumos", amount: -200, category_name: "Insumos" },
  { id: "t3", pluggy_staging_transaction_id: "s2", description: "Juros", amount: -50, category_name: "Juros e Multas" },
];

describe("buildExtratoConciliacao", () => {
  const model = buildExtratoConciliacao({ staging, transactions });

  it("classifica créditos e débitos", () => {
    expect(sideOf(10)).toBe("credito");
    expect(sideOf(-1)).toBe("debito");
    expect(model.totais.creditos).toEqual({ total: 1045, count: 2 });
    expect(model.totais.debitos).toEqual({ total: -280, count: 2 });
  });

  it("soma apenas conciliados no total da plataforma e calcula a diferença", () => {
    expect(model.totais.totalExtrato).toBe(765);
    expect(model.totais.totalConciliado).toBe(750);
    expect(model.totais.diferenca).toBe(15);
  });

  it("aponta divergências de pendentes e ignorados", () => {
    expect(model.divergencias.map((r) => r.stagingId)).toEqual(["s3", "s4"]);
    expect(model.totais.creditosSemConciliacao).toEqual({ total: 45, count: 1 });
    expect(model.totais.debitosSemConciliacao).toEqual({ total: -30, count: 1 });
  });

  it("respeita o filtro de situação sem alterar os totais", () => {
    const conciliados = buildExtratoConciliacao({ staging, transactions, statusFilter: "conciliados" });
    expect(conciliados.rows.map((r) => r.stagingId)).toEqual(["s1", "s2"]);
    expect(conciliados.totais.totalExtrato).toBe(765);

    const sem = buildExtratoConciliacao({ staging, transactions, statusFilter: "sem-conciliacao" });
    expect(sem.rows.map((r) => r.stagingId)).toEqual(["s3", "s4"]);
  });

  it("agrupa por dia com total diário", () => {
    const groups = groupExtratoByDay(model.rows);
    expect(groups.map((g) => g.date)).toEqual(["2026-01-02", "2026-01-03"]);
    expect(groups[0].total).toBe(750);
    expect(groups[1].total).toBe(15);
  });

  it("agrupa múltiplos lançamentos da mesma linha do banco (divisão)", () => {
    const s2 = model.rows.find((r) => r.stagingId === "s2")!;
    expect(s2.platforms.map((p) => p.id)).toEqual(["t2", "t3"]);
    expect(s2.platformTotal).toBe(250);
    expect(s2.divergenteValor).toBe(false);
    expect(s2.conciliado).toBe(true);
  });

  it("expõe o período coberto", () => {
    expect(model.periodo).toEqual({ from: "2026-01-02", to: "2026-01-03" });
  });
});
