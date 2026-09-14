import { describe, it, expect } from "vitest";
import {
  calcularRemuneracaoConvocacao,
  minutosNoturnos,
  remuneracaoDoSnapshot,
} from "@/lib/dp/convocacao-remuneracao";

describe("minutosNoturnos", () => {
  it("ignora jornada diurna", () => {
    expect(minutosNoturnos("08:00", "17:00")).toBe(0);
  });

  it("conta as horas após as 22h", () => {
    expect(minutosNoturnos("20:00", "23:00")).toBe(60);
  });

  it("conta a virada da madrugada até as 5h", () => {
    expect(minutosNoturnos("22:00", "04:00", true)).toBe(6 * 60);
  });

  it("limita a janela noturna em 5h", () => {
    expect(minutosNoturnos("23:00", "08:00", true)).toBe(6 * 60);
  });
});

describe("calcularRemuneracaoConvocacao", () => {
  it("abre as verbas proporcionais do intermitente", () => {
    const r = calcularRemuneracaoConvocacao({
      valorUnitario: 10,
      unidade: "hora",
      quantidade: 8,
      entrada: "08:00",
      saida: "17:00",
    });
    expect(r.valorHoras).toBe(80);
    expect(r.decimoTerceiro).toBeCloseTo(6.67, 2);
    expect(r.ferias).toBeCloseTo(6.67, 2);
    expect(r.tercoFerias).toBeCloseTo(2.22, 2);
    expect(r.inss).toBeGreaterThan(0);
    expect(r.fgts).toBeCloseTo(Number((r.baseTributavel * 0.08).toFixed(2)), 2);
    expect(r.liquido).toBeCloseTo(Number((r.bruto - r.inss).toFixed(2)), 2);
  });

  it("soma adicional noturno e vale-alimentação", () => {
    const r = calcularRemuneracaoConvocacao({
      valorUnitario: 10,
      unidade: "hora",
      quantidade: 6,
      entrada: "20:00",
      saida: "02:00",
      terminaNoDiaSeguinte: true,
      valeAlimentacaoDia: 22,
      valeAlimentacaoDescontoDia: 2,
    });
    expect(r.horasNoturnas).toBe(4);
    expect(r.adicionalNoturno).toBeCloseTo(8, 2);
    expect(r.valeAlimentacao).toBe(22);
    expect(r.descontos).toBeCloseTo(Number((r.inss + 2).toFixed(2)), 2);
  });

  it("freelancer não gera verbas CLT nem INSS", () => {
    const r = calcularRemuneracaoConvocacao({
      valorUnitario: 150,
      unidade: "diaria",
      quantidade: 1,
      comVerbasProporcionais: false,
    });
    expect(r.decimoTerceiro).toBe(0);
    expect(r.inss).toBe(0);
    expect(r.fgts).toBe(0);
    expect(r.liquido).toBe(150);
  });
});

describe("remuneracaoDoSnapshot", () => {
  it("retorna null sem valores", () => {
    expect(remuneracaoDoSnapshot(null)).toBeNull();
    expect(remuneracaoDoSnapshot({ valor_unitario: 0 })).toBeNull();
  });

  it("usa o horário da oferta para o noturno", () => {
    const r = remuneracaoDoSnapshot(
      { valor_unitario: 12, quantidade_prevista: 5, unidade_remuneracao: "hora", vale_alimentacao_dia: 15 },
      { entrada: "22:00", saida: "03:00", termina_no_dia_seguinte: true },
    );
    expect(r?.horasNoturnas).toBe(5);
    expect(r?.valeAlimentacao).toBe(15);
  });
});
