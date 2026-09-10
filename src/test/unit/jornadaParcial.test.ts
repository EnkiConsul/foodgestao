import { describe, it, expect } from "vitest";
import {
  baseHorasMesSugerida,
  salarioProporcional,
  BASE_HORAS_INTEGRAL,
} from "@/lib/dp/jornadaParcial";

describe("baseHorasMesSugerida", () => {
  it("sugere 150h para 30h semanais", () => {
    expect(baseHorasMesSugerida(30)).toBe(150);
  });

  it("sugere 220h para a jornada integral", () => {
    expect(baseHorasMesSugerida(44)).toBe(BASE_HORAS_INTEGRAL);
  });

  it("sem carga informada, mantém a base integral", () => {
    expect(baseHorasMesSugerida(null)).toBe(BASE_HORAS_INTEGRAL);
  });
});

describe("salarioProporcional", () => {
  it("30h sobre 44h com base 150h", () => {
    const r = salarioProporcional({
      salarioCargo: 1750,
      cargaSemanal: 30,
      cargaBaseCargo: 44,
      baseHorasMes: 150,
    });
    expect(r.parcial).toBe(true);
    expect(r.salario).toBe(1193.18);
    expect(r.valorHora).toBe(7.95);
  });

  it("carga igual à base do cargo não reduz o salário", () => {
    const r = salarioProporcional({
      salarioCargo: 1750,
      cargaSemanal: 44,
      cargaBaseCargo: 44,
      baseHorasMes: 220,
    });
    expect(r.parcial).toBe(false);
    expect(r.salario).toBe(1750);
    expect(r.valorHora).toBe(7.95);
  });

  it("cargo sem salário de referência não calcula valores", () => {
    const r = salarioProporcional({ salarioCargo: null, cargaSemanal: 30 });
    expect(r.salario).toBeNull();
    expect(r.valorHora).toBeNull();
    expect(r.explicacao).toContain("informe o valor à mão");
  });

  it("carga acima da base não aumenta o salário do cargo", () => {
    const r = salarioProporcional({
      salarioCargo: 2000,
      cargaSemanal: 48,
      cargaBaseCargo: 44,
      baseHorasMes: 220,
    });
    expect(r.fator).toBe(1);
    expect(r.salario).toBe(2000);
  });

  it("sem carga base do cargo, usa 44h", () => {
    const r = salarioProporcional({ salarioCargo: 4400, cargaSemanal: 22, baseHorasMes: 110 });
    expect(r.cargaBase).toBe(44);
    expect(r.salario).toBe(2200);
  });
});
