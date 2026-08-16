import { describe, expect, it } from "vitest";
import {
  aplicarReajuste,
  salarioCargoNaUnidade,
  validarOverrideUnidade,
} from "@/lib/dp/cargoSalarios";

const pisoPatronal = (
  sindicato_patronal_id: string,
  salario_base: number,
  vigencia_inicio = "2026-01-01",
  vigencia_fim: string | null = null,
) => ({ unidade_id: null, sindicato_patronal_id, salario_base, vigencia_inicio, vigencia_fim });

const ajusteUnidade = (
  unidade_id: string,
  salario_base: number,
  vigencia_inicio = "2026-01-01",
  vigencia_fim: string | null = null,
) => ({ unidade_id, sindicato_patronal_id: null, salario_base, vigencia_inicio, vigencia_fim });

describe("salarioCargoNaUnidade", () => {
  it("unidades com o mesmo patronal compartilham o piso", () => {
    const linhas = [pisoPatronal("p1", 2400)];
    expect(salarioCargoNaUnidade(linhas, "u1", "p1", "2026-03-01")).toMatchObject({
      valor: 2400,
      origem: "patronal",
    });
    expect(salarioCargoNaUnidade(linhas, "u2", "p1", "2026-03-01").valor).toBe(2400);
  });

  it("patronal diferente exige cadastro próprio (não herda)", () => {
    const r = salarioCargoNaUnidade([pisoPatronal("p1", 2400)], "u2", "p2", "2026-03-01");
    expect(r.valor).toBeNull();
    expect(r.origem).toBe("pendente");
    expect(r.faltaPisoPatronal).toBe(true);
  });

  it("ajuste da unidade prevalece sobre o piso do patronal", () => {
    const r = salarioCargoNaUnidade(
      [pisoPatronal("p1", 2400), ajusteUnidade("u1", 2600)],
      "u1",
      "p1",
      "2026-03-01",
    );
    expect(r).toMatchObject({ valor: 2600, origem: "unidade", pisoPatronal: 2400 });
  });

  it("ignora piso fora de vigência", () => {
    const r = salarioCargoNaUnidade([pisoPatronal("p1", 2400, "2026-01-01", "2026-02-01")], "u1", "p1", "2026-03-01");
    expect(r.origem).toBe("pendente");
  });

  it("prefere a vigência mais recente", () => {
    const r = salarioCargoNaUnidade(
      [pisoPatronal("p1", 2400), pisoPatronal("p1", 2600, "2026-02-01")],
      "u1",
      "p1",
      "2026-03-01",
    );
    expect(r.valor).toBe(2600);
  });

  it("unidade sem patronal vinculado fica pendente", () => {
    const r = salarioCargoNaUnidade([pisoPatronal("p1", 2400)], "u9", null, "2026-03-01");
    expect(r.semPatronalVinculado).toBe(true);
    expect(r.origem).toBe("pendente");
  });
});

describe("validarOverrideUnidade", () => {
  it("aceita valor igual ou acima do piso", () => {
    expect(validarOverrideUnidade(2400, 2400).ok).toBe(true);
    expect(validarOverrideUnidade(2600, 2400).ok).toBe(true);
  });
  it("recusa abaixo do piso", () => {
    expect(validarOverrideUnidade(2300, 2400)).toEqual({ ok: false, motivo: "abaixo_do_piso", piso: 2400 });
  });
  it("recusa sem piso do patronal", () => {
    expect(validarOverrideUnidade(2300, null)).toEqual({ ok: false, motivo: "sem_piso_patronal" });
  });
  it("recusa valor inválido", () => {
    expect(validarOverrideUnidade(0, 2400)).toEqual({ ok: false, motivo: "valor_invalido" });
  });
});

describe("aplicarReajuste", () => {
  it("arredonda em centavos", () => {
    expect(aplicarReajuste(1500, 5.5)).toBe(1582.5);
    expect(aplicarReajuste(1412.35, 4.13)).toBe(1470.68);
  });
});
