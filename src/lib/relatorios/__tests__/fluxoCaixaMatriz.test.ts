import { describe, it, expect } from "vitest";
import {
  buildFluxoMatriz,
  monthsBetween,
  effectiveSide,
  effectiveDate,
  effectiveAmount,
  type MatrizCategory,
  type MatrizTransaction,
} from "@/lib/relatorios/fluxoCaixaMatriz";

const cats: MatrizCategory[] = [
  { id: "r", name: "RECEITAS", parent_id: null, transaction_type: "entrada" },
  { id: "r1", name: "Vendas", parent_id: "r", transaction_type: "entrada" },
  { id: "d", name: "DESPESAS", parent_id: null, transaction_type: "saida" },
  { id: "d1", name: "Aluguel", parent_id: "d", transaction_type: "saida" },
];

const tx = (o: Partial<MatrizTransaction>): MatrizTransaction => ({
  category_id: null,
  amount: 0,
  amount_paid: 0,
  transaction_type: "entrada",
  parcel_direction: null,
  transaction_date: null,
  due_date: null,
  payment_date: null,
  status: "confirmado",
  ...o,
});

describe("monthsBetween", () => {
  it("gera o intervalo inclusivo", () => {
    expect(monthsBetween("2026-01", "2026-04")).toEqual(["2026-01", "2026-02", "2026-03", "2026-04"]);
  });
});

describe("helpers", () => {
  it("resolve o lado do parcelamento pela direção", () => {
    expect(effectiveSide(tx({ transaction_type: "parcelamento", parcel_direction: "saida" }))).toBe("saida");
    expect(effectiveSide(tx({ transaction_type: "transferencia" }))).toBeNull();
  });
  it("usa a data conforme a base", () => {
    const t = tx({ due_date: "2026-02-10", payment_date: "2026-03-05" });
    expect(effectiveDate(t, "vencimento")).toBe("2026-02-10");
    expect(effectiveDate(t, "pagamento")).toBe("2026-03-05");
  });
  it("usa amount_paid na base pagamento", () => {
    const t = tx({ amount: 100, amount_paid: 60 });
    expect(effectiveAmount(t, "pagamento")).toBe(60);
    expect(effectiveAmount(t, "vencimento")).toBe(100);
  });
});

describe("buildFluxoMatriz", () => {
  const months = monthsBetween("2026-01", "2026-02");

  it("propaga os filhos para os pais e calcula saldo", () => {
    const res = buildFluxoMatriz({
      categories: cats,
      months,
      basis: "vencimento",
      transactions: [
        tx({ category_id: "r1", amount: 1000, due_date: "2026-01-10" }),
        tx({ category_id: "d1", amount: 400, transaction_type: "saida", due_date: "2026-02-05" }),
      ],
    });
    const receitas = res.rows.find((r) => r.id === "r")!;
    expect(receitas.values).toEqual([1000, 0]);
    expect(receitas.index).toBe("1");
    const vendas = res.rows.find((r) => r.id === "r1")!;
    expect(vendas.index).toBe("1.1");
    expect(res.totals.saldo).toEqual([1000, -400]);
    expect(res.totals.totalSaldo).toBe(600);
  });

  it("oculta ramos sem movimento quando hideEmpty", () => {
    const res = buildFluxoMatriz({
      categories: cats,
      months,
      basis: "vencimento",
      transactions: [tx({ category_id: "r1", amount: 50, due_date: "2026-01-01" })],
    });
    expect(res.rows.some((r) => r.id === "d1")).toBe(false);
    const withEmpty = buildFluxoMatriz({
      categories: cats,
      months,
      basis: "vencimento",
      hideEmpty: false,
      transactions: [],
    });
    expect(withEmpty.rows.some((r) => r.id === "d1")).toBe(true);
  });

  it("agrupa lançamentos sem categoria", () => {
    const res = buildFluxoMatriz({
      categories: cats,
      months,
      basis: "pagamento",
      transactions: [tx({ amount: 90, amount_paid: 90, payment_date: "2026-02-02" })],
    });
    const sc = res.rows.find((r) => r.name === "Sem categoria")!;
    expect(sc.values).toEqual([0, 90]);
    expect(res.totals.totalEntradas).toBe(90);
  });

  it("ignora cancelados e transferências", () => {
    const res = buildFluxoMatriz({
      categories: cats,
      months,
      basis: "vencimento",
      transactions: [
        tx({ category_id: "r1", amount: 100, due_date: "2026-01-01", status: "cancelado" }),
        tx({ category_id: "r1", amount: 100, due_date: "2026-01-01", transaction_type: "transferencia" }),
      ],
    });
    expect(res.totals.totalEntradas).toBe(0);
  });
});
