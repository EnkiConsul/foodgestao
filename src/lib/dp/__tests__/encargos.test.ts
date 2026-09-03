import { describe, expect, it } from "vitest";
import { calcularEncargos, calcularFgts, calcularInss, calcularIrrf } from "../encargos";
import { encargosDoLancamento, lerDetalhe, valoresDoLancamento } from "../folha";
import { linhasDoHolerite } from "../holerite";

describe("encargos legais (Fase 17)", () => {
  it("INSS é progressivo por faixas", () => {
    expect(calcularInss(0)).toBe(0);
    expect(calcularInss(1000)).toBe(75);
    // 1518 * 7,5% + 482 * 9%
    expect(calcularInss(2000)).toBe(157.23);
  });

  it("INSS respeita o teto de contribuição", () => {
    const teto = calcularInss(8157.41);
    expect(calcularInss(50000)).toBe(teto);
  });

  it("IRRF isenta a primeira faixa e aplica dedução nas demais", () => {
    expect(calcularIrrf(2000)).toBe(0);
    expect(calcularIrrf(3000)).toBe(Math.round((3000 * 0.15 - 394.16) * 100) / 100);
  });

  it("dependentes reduzem a base do IRRF", () => {
    const sem = calcularEncargos(5000, 0);
    const com = calcularEncargos(5000, 2);
    expect(com.baseIrrf).toBeLessThan(sem.baseIrrf);
    expect(com.irrf).toBeLessThan(sem.irrf);
  });

  it("FGTS é 8% e não entra nos descontos do colaborador", () => {
    const e = calcularEncargos(2000);
    expect(e.fgts).toBe(calcularFgts(2000));
    expect(e.descontos).toBe(Math.round((e.inss + e.irrf) * 100) / 100);
  });

  it("o líquido do lançamento já vem deduzido de INSS e IRRF", () => {
    const detalhe = lerDetalhe({
      faltas: 100,
      dsr: 20,
      proventos: { normais: 2000, extras50: 100, extras100: 0, noturno: 0 },
      horas: { normais: 220, extras50: 6, extras100: 0, noturnos: 0, falta: 8, atraso: 0, diasFalta: 1, dsrPerdidos: 1 },
    });
    const enc = encargosDoLancamento(detalhe);
    expect(enc.baseInss).toBe(1980);
    expect(valoresDoLancamento(detalhe).liquido).toBe(
      Math.round((2100 - 100 - 20 - enc.descontos) * 100) / 100,
    );
  });

  it("holerite mostra as linhas de INSS e IRRF", () => {
    const detalhe = lerDetalhe({
      faltas: 0,
      dsr: 0,
      proventos: { normais: 6000, extras50: 0, extras100: 0, noturno: 0 },
      horas: { normais: 220, extras50: 0, extras100: 0, noturnos: 0, falta: 0, atraso: 0, diasFalta: 0, dsrPerdidos: 0 },
    });
    const linhas = linhasDoHolerite({
      empresa: "Aveto 360",
      colaborador: "Karine",
      competencia: "2026-06-01",
      tipo: "contracheque_mensal",
      detalhe,
      valorBruto: 6000,
      valorLiquido: valoresDoLancamento(detalhe).liquido,
    });
    expect(linhas.find((l) => l.descricao === "INSS")?.desconto).toBeGreaterThan(0);
    expect(linhas.find((l) => l.descricao === "IRRF")?.desconto).toBeGreaterThan(0);
  });
});
