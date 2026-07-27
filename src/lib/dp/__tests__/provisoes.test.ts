import { describe, expect, it } from "vitest";
import {
  avosDoDecimoTerceiro,
  diasDeGozo,
  rubricasDeFerias,
  rubricasDoDecimoTerceiro,
} from "../provisoes";
import { lerDetalhe, lerExtras, proventosTributaveis, valoresDoLancamento } from "../folha";

const detalhe = (extras: ReturnType<typeof rubricasDeFerias>) => ({
  ...lerDetalhe({}),
  extras: lerExtras(extras),
});

describe("férias (Fase 18)", () => {
  it("calcula férias com 1/3 constitucional", () => {
    const r = rubricasDeFerias({ salarioBase: 3000, diasGozo: 30 });
    expect(r.map((x) => x.valor)).toEqual([3000, 1000]);
  });

  it("abono pecuniário é limitado a 10 dias e não é tributável", () => {
    const r = rubricasDeFerias({ salarioBase: 3000, diasGozo: 20, diasAbono: 15 });
    const abono = r.find((x) => x.descricao.startsWith("Abono"));
    expect(abono?.descricao).toContain("10 dias");
    expect(abono?.tributavel).toBe(false);
  });

  it("adiantamento do 13º entra como provento não tributável", () => {
    const r = rubricasDeFerias({ salarioBase: 2000, diasGozo: 30, adiantar13: true });
    const ad = r.find((x) => x.descricao.startsWith("Adiantamento"));
    expect(ad?.valor).toBe(1000);
    expect(proventosTributaveis(lerExtras(r))).toBe(2000 + 666.67);
  });

  it("sem salário base não gera rubricas", () => {
    expect(rubricasDeFerias({ salarioBase: 0, diasGozo: 30 })).toEqual([]);
  });

  it("conta os dias de gozo inclusive", () => {
    expect(diasDeGozo("2026-07-01", "2026-07-30")).toBe(30);
    expect(diasDeGozo("2026-07-10", "2026-07-01")).toBe(0);
  });
});

describe("13º salário (Fase 18)", () => {
  it("conta avos pela regra dos 15 dias", () => {
    expect(avosDoDecimoTerceiro(2026, "2026-03-10")).toBe(10);
    expect(avosDoDecimoTerceiro(2026, "2026-03-20")).toBe(9);
    expect(avosDoDecimoTerceiro(2026, "2025-01-01")).toBe(12);
    expect(avosDoDecimoTerceiro(2026, "2027-01-01")).toBe(0);
  });

  it("desliga avos após a saída", () => {
    expect(avosDoDecimoTerceiro(2026, "2025-01-01", "2026-06-20")).toBe(6);
    expect(avosDoDecimoTerceiro(2026, "2025-01-01", "2026-06-05")).toBe(5);
  });

  it("1ª parcela é metade e não sofre encargos", () => {
    const r = rubricasDoDecimoTerceiro({ salarioBase: 2400, avos: 12, parcela: 1 });
    expect(r[0].valor).toBe(1200);
    const v = valoresDoLancamento(detalhe(r));
    expect(v).toEqual({ bruto: 1200, liquido: 1200 });
  });

  it("2ª parcela desconta o adiantamento e aplica encargos", () => {
    const r = rubricasDoDecimoTerceiro({ salarioBase: 2400, avos: 12, parcela: 2, adiantamento: 1200 });
    expect(r[1]).toMatchObject({ descricao: "Adiantamento 13º (1ª parcela)", valor: 1200 });
    const v = valoresDoLancamento(detalhe(r));
    expect(v.bruto).toBe(2400);
    expect(v.liquido).toBeLessThan(1200);
  });
});
