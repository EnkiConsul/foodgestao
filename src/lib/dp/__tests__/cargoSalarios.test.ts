import { describe, expect, it } from "vitest";
import { aplicarReajuste, salarioCargoNaUnidade } from "@/lib/dp/cargoSalarios";

const piso = (unidade_id: string, salario_base: number, vigencia_inicio = "2026-01-01", vigencia_fim: string | null = null) =>
  ({ unidade_id, salario_base, vigencia_inicio, vigencia_fim });

describe("salarioCargoNaUnidade", () => {
  it("usa o piso da unidade quando existe", () => {
    const r = salarioCargoNaUnidade(2000, [piso("u1", 2400)], "u1", "2026-03-01");
    expect(r.valor).toBe(2400);
    expect(r.origem).toBe("unidade");
  });

  it("não iguala unidades diferentes: sem piso próprio, sinaliza pendência", () => {
    const r = salarioCargoNaUnidade(2000, [piso("u1", 2400)], "u2", "2026-03-01");
    expect(r.faltaPisoDaUnidade).toBe(true);
    expect(r.origem).toBe("cargo");
  });

  it("cai no salário geral do cargo quando não há pisos", () => {
    const r = salarioCargoNaUnidade(2000, [], "u1");
    expect(r).toMatchObject({ valor: 2000, origem: "cargo", faltaPisoDaUnidade: false });
  });

  it("ignora piso fora de vigência", () => {
    const r = salarioCargoNaUnidade(2000, [piso("u1", 2400, "2026-01-01", "2026-02-01")], "u1", "2026-03-01");
    expect(r.valor).toBe(2000);
    expect(r.faltaPisoDaUnidade).toBe(true);
  });

  it("prefere a vigência mais recente", () => {
    const r = salarioCargoNaUnidade(2000, [piso("u1", 2400), piso("u1", 2600, "2026-02-01")], "u1", "2026-03-01");
    expect(r.valor).toBe(2600);
  });

  it("sem referência alguma", () => {
    expect(salarioCargoNaUnidade(null, [], "u1").origem).toBe("nenhuma");
  });
});

describe("aplicarReajuste", () => {
  it("arredonda em centavos", () => {
    expect(aplicarReajuste(1500, 5.5)) .toBe(1582.5);
    expect(aplicarReajuste(1412.35, 4.13)).toBe(1470.68);
  });
});
