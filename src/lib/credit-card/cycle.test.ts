import { describe, it, expect } from "vitest";
import {
  assignPurchaseToInvoice,
  closingDateOfMonth,
  CycleValidationError,
  daysInMonth,
  dueDateForClosing,
  nextInvoice,
  resolveCycleDate,
  toYmd,
} from "./cycle";

describe("daysInMonth", () => {
  it("cobre meses variáveis", () => {
    expect(daysInMonth(2026, 1)).toBe(31);
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2024, 2)).toBe(29); // bissexto
    expect(daysInMonth(2026, 4)).toBe(30);
    expect(daysInMonth(2026, 12)).toBe(31);
  });
});

describe("resolveCycleDate", () => {
  it("aplica LEAST(day, days_in_month)", () => {
    expect(toYmd(resolveCycleDate(2026, 2, 31))).toBe("2026-02-28");
    expect(toYmd(resolveCycleDate(2024, 2, 31))).toBe("2024-02-29");
    expect(toYmd(resolveCycleDate(2026, 4, 31))).toBe("2026-04-30");
    expect(toYmd(resolveCycleDate(2026, 7, 15))).toBe("2026-07-15");
  });

  it("rejeita dia inválido", () => {
    expect(() => resolveCycleDate(2026, 1, 0)).toThrow(CycleValidationError);
    expect(() => resolveCycleDate(2026, 1, 32)).toThrow(CycleValidationError);
    expect(() => resolveCycleDate(2026, 13, 1)).toThrow(CycleValidationError);
  });
});

describe("dueDateForClosing", () => {
  it("dueDay > closingDay → vence no mesmo mês do fechamento", () => {
    const closing = closingDateOfMonth(2026, 7, { closingDay: 5, dueDay: 15 });
    const due = dueDateForClosing(closing, { closingDay: 5, dueDay: 15 });
    expect(toYmd(due)).toBe("2026-07-15");
  });

  it("dueDay <= closingDay → vence no mês SEGUINTE", () => {
    // Fatura fecha em 25/jul, vence em 10/ago.
    const closing = closingDateOfMonth(2026, 7, { closingDay: 25, dueDay: 10 });
    const due = dueDateForClosing(closing, { closingDay: 25, dueDay: 10 });
    expect(toYmd(due)).toBe("2026-08-10");
  });

  it("due == closing (mesmo dia) → mês seguinte", () => {
    const closing = closingDateOfMonth(2026, 7, { closingDay: 10, dueDay: 10 });
    const due = dueDateForClosing(closing, { closingDay: 10, dueDay: 10 });
    expect(toYmd(due)).toBe("2026-08-10");
  });

  it("fechamento em fev com dia 31 fecha em 28/29", () => {
    const closing2026 = closingDateOfMonth(2026, 2, { closingDay: 31, dueDay: 10 });
    expect(toYmd(closing2026)).toBe("2026-02-28");
    const closing2024 = closingDateOfMonth(2024, 2, { closingDay: 31, dueDay: 10 });
    expect(toYmd(closing2024)).toBe("2024-02-29");
  });
});

describe("assignPurchaseToInvoice", () => {
  const cfg = { closingDay: 25, dueDay: 10 };

  it("compra ANTES do fechamento entra na fatura corrente", () => {
    const inv = assignPurchaseToInvoice(new Date(2026, 6, 20), cfg); // 20/jul
    expect(toYmd(inv.closingDate)).toBe("2026-07-25");
    expect(toYmd(inv.dueDate)).toBe("2026-08-10");
    expect(toYmd(inv.referenceMonth)).toBe("2026-07-01");
    expect(toYmd(inv.periodStart)).toBe("2026-06-26");
  });

  it("compra NO DIA do fechamento entra na fatura corrente", () => {
    const inv = assignPurchaseToInvoice(new Date(2026, 6, 25), cfg);
    expect(toYmd(inv.closingDate)).toBe("2026-07-25");
  });

  it("compra APÓS o fechamento avança para o próximo ciclo", () => {
    const inv = assignPurchaseToInvoice(new Date(2026, 6, 26), cfg);
    expect(toYmd(inv.closingDate)).toBe("2026-08-25");
    expect(toYmd(inv.dueDate)).toBe("2026-09-10");
    expect(toYmd(inv.periodStart)).toBe("2026-07-26");
  });

  it("virada de ano: dezembro → janeiro", () => {
    const inv = assignPurchaseToInvoice(new Date(2026, 11, 30), cfg); // 30/dez
    expect(toYmd(inv.closingDate)).toBe("2027-01-25");
    expect(toYmd(inv.dueDate)).toBe("2027-02-10");
    expect(toYmd(inv.referenceMonth)).toBe("2027-01-01");
  });

  it("fechamento dia 31 em fevereiro (não-bissexto)", () => {
    const c = { closingDay: 31, dueDay: 10 };
    const inv = assignPurchaseToInvoice(new Date(2026, 1, 15), c); // 15/fev
    expect(toYmd(inv.closingDate)).toBe("2026-02-28");
    expect(toYmd(inv.dueDate)).toBe("2026-03-10");
  });

  it("fechamento dia 31 em fevereiro (bissexto)", () => {
    const c = { closingDay: 31, dueDay: 10 };
    const inv = assignPurchaseToInvoice(new Date(2024, 1, 15), c);
    expect(toYmd(inv.closingDate)).toBe("2024-02-29");
  });

  it("periodStart é o dia seguinte ao fechamento anterior", () => {
    // Compra em ago/2026 com closingDay=25 → periodStart = 26/jul.
    const inv = assignPurchaseToInvoice(new Date(2026, 7, 10), cfg);
    expect(toYmd(inv.periodStart)).toBe("2026-07-26");
    expect(toYmd(inv.closingDate)).toBe("2026-08-25");
  });
});

describe("nextInvoice", () => {
  const cfg = { closingDay: 25, dueDay: 10 };

  it("gera a fatura sucessora consistente", () => {
    const jul = assignPurchaseToInvoice(new Date(2026, 6, 10), cfg);
    const ago = nextInvoice(jul, cfg);
    expect(toYmd(ago.closingDate)).toBe("2026-08-25");
    expect(toYmd(ago.dueDate)).toBe("2026-09-10");
    expect(toYmd(ago.periodStart)).toBe("2026-07-26");
    expect(toYmd(ago.referenceMonth)).toBe("2026-08-01");
  });

  it("respeita mês curto ao avançar", () => {
    const c = { closingDay: 31, dueDay: 10 };
    const jan = assignPurchaseToInvoice(new Date(2026, 0, 15), c);
    expect(toYmd(jan.closingDate)).toBe("2026-01-31");
    const fev = nextInvoice(jan, c);
    expect(toYmd(fev.closingDate)).toBe("2026-02-28");
  });
});
