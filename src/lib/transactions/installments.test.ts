import { describe, it, expect } from "vitest";
import {
  planInstallments,
  getNextRecurrenceDate,
  selectAffectedChildren,
  sumChildren,
  InstallmentValidationError,
} from "./installments";

const start = new Date(Date.UTC(2026, 0, 15, 12, 0, 0)); // 15/Jan/2026 UTC

describe("getNextRecurrenceDate", () => {
  it("avança conforme o período", () => {
    const base = new Date(Date.UTC(2026, 0, 15));
    expect(getNextRecurrenceDate(base, "diario").getUTCDate()).toBe(16);
    expect(getNextRecurrenceDate(base, "semanal").getUTCDate()).toBe(22);
    expect(getNextRecurrenceDate(base, "quinzenal").getUTCDate()).toBe(29);
    expect(getNextRecurrenceDate(base, "mensal").getUTCMonth()).toBe(1);
    expect(getNextRecurrenceDate(base, "bimestral").getUTCMonth()).toBe(2);
    expect(getNextRecurrenceDate(base, "trimestral").getUTCMonth()).toBe(3);
    expect(getNextRecurrenceDate(base, "semestral").getUTCMonth()).toBe(6);
    expect(getNextRecurrenceDate(base, "anual").getUTCFullYear()).toBe(2027);
  });
  it("fallback = mensal", () => {
    const base = new Date(Date.UTC(2026, 0, 15));
    expect(getNextRecurrenceDate(base, "desconhecido").getUTCMonth()).toBe(1);
  });
});

describe("planInstallments — modo 'parcela'", () => {
  it("gera N filhas com valor fixo e total = valor × N", () => {
    const plan = planInstallments({
      inputAmount: 100,
      installmentTotal: 3,
      mode: "parcela",
      period: "mensal",
      startDate: start,
    });
    expect(plan.totalAmount).toBe(300);
    expect(plan.baseParcel).toBe(100);
    expect(plan.remainder).toBe(0);
    expect(plan.children).toHaveLength(3);
    expect(plan.children.every((c) => c.amount === 100)).toBe(true);
    expect(plan.children.map((c) => c.installment_number)).toEqual([1, 2, 3]);
  });

  it("parent registra o total e a primeira data", () => {
    const plan = planInstallments({
      inputAmount: 50,
      installmentTotal: 4,
      mode: "parcela",
      period: "mensal",
      startDate: start,
    });
    expect(plan.parent.amount).toBe(200);
    expect(plan.parent.installment_total).toBe(4);
    expect(plan.parent.transaction_date).toBe(plan.children[0].transaction_date);
  });
});

describe("planInstallments — modo 'total' com remainder", () => {
  it("R$ 100 em 3× → 33,33 + 33,33 + 33,34", () => {
    const plan = planInstallments({
      inputAmount: 100,
      installmentTotal: 3,
      mode: "total",
      period: "mensal",
      startDate: start,
    });
    expect(plan.baseParcel).toBe(33.33);
    expect(plan.remainder).toBeCloseTo(0.01, 10);
    expect(plan.children.map((c) => c.amount)).toEqual([33.33, 33.33, 33.34]);
    expect(sumChildren(plan.children)).toBe(100);
  });

  it("valor divisível não gera remainder", () => {
    const plan = planInstallments({
      inputAmount: 600,
      installmentTotal: 6,
      mode: "total",
      period: "mensal",
      startDate: start,
    });
    expect(plan.remainder).toBe(0);
    expect(plan.children.every((c) => c.amount === 100)).toBe(true);
    expect(sumChildren(plan.children)).toBe(600);
  });

  it("valor com centavo ímpar concentra sobra na última parcela", () => {
    const plan = planInstallments({
      inputAmount: 10,
      installmentTotal: 3,
      mode: "total",
      period: "mensal",
      startDate: start,
    });
    // 10 / 3 = 3.333... → floor cent = 3.33; sobra = 10 - 9.99 = 0.01
    expect(plan.baseParcel).toBe(3.33);
    expect(plan.children.map((c) => c.amount)).toEqual([3.33, 3.33, 3.34]);
    expect(sumChildren(plan.children)).toBe(10);
  });
});

describe("planInstallments — datas por período", () => {
  it("mensal: cada parcela cai +1 mês", () => {
    const plan = planInstallments({
      inputAmount: 300,
      installmentTotal: 3,
      mode: "total",
      period: "mensal",
      startDate: start,
    });
    const months = plan.children.map((c) => Number(c.transaction_date.slice(5, 7)));
    expect(months).toEqual([1, 2, 3]);
  });

  it("semanal: cada parcela cai +7 dias", () => {
    const plan = planInstallments({
      inputAmount: 300,
      installmentTotal: 3,
      mode: "total",
      period: "semanal",
      startDate: start,
    });
    const days = plan.children.map((c) => Number(c.transaction_date.slice(8, 10)));
    expect(days).toEqual([15, 22, 29]);
  });

  it("transaction_date === due_date em toda filha", () => {
    const plan = planInstallments({
      inputAmount: 300,
      installmentTotal: 3,
      mode: "total",
      period: "mensal",
      startDate: start,
    });
    plan.children.forEach((c) => expect(c.due_date).toBe(c.transaction_date));
  });
});

describe("planInstallments — validações", () => {
  it("rejeita installmentTotal < 2", () => {
    expect(() =>
      planInstallments({
        inputAmount: 100,
        installmentTotal: 1,
        mode: "total",
        period: "mensal",
        startDate: start,
      }),
    ).toThrow(InstallmentValidationError);
  });

  it("rejeita valores não positivos", () => {
    expect(() =>
      planInstallments({
        inputAmount: 0,
        installmentTotal: 3,
        mode: "total",
        period: "mensal",
        startDate: start,
      }),
    ).toThrow(InstallmentValidationError);
    expect(() =>
      planInstallments({
        inputAmount: -10,
        installmentTotal: 3,
        mode: "total",
        period: "mensal",
        startDate: start,
      }),
    ).toThrow(InstallmentValidationError);
  });

  it("rejeita número não inteiro de parcelas", () => {
    expect(() =>
      planInstallments({
        inputAmount: 100,
        installmentTotal: 2.5,
        mode: "total",
        period: "mensal",
        startDate: start,
      }),
    ).toThrow(InstallmentValidationError);
  });
});

describe("selectAffectedChildren", () => {
  const children = [
    { installment_number: 1 },
    { installment_number: 2 },
    { installment_number: 3 },
    { installment_number: 4 },
  ];

  it("scope=single retorna só o alvo", () => {
    expect(selectAffectedChildren(children, children[1], "single")).toEqual([children[1]]);
  });

  it("scope=forward retorna a parcela alvo e as seguintes", () => {
    expect(selectAffectedChildren(children, children[1], "forward").map((c) => c.installment_number))
      .toEqual([2, 3, 4]);
  });

  it("scope=all retorna todas", () => {
    expect(selectAffectedChildren(children, children[1], "all")).toHaveLength(4);
  });

  it("scope=all retorna cópia (não a mesma referência)", () => {
    const out = selectAffectedChildren(children, children[0], "all");
    expect(out).not.toBe(children);
  });
});

describe("sumChildren", () => {
  it("soma com 2 casas garantidas", () => {
    expect(sumChildren([{ amount: 33.33 }, { amount: 33.33 }, { amount: 33.34 }])).toBe(100);
  });
});
