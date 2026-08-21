import { describe, it, expect } from "vitest";
import {
  calcularAdicionalPorModo,
  calcularAdicionalTempoServico,
  mesesDeCasa,
  selecionarRegraTempoServico,
  type RegraTempoServico,
} from "../tempoServico";


const regra = (over: Partial<RegraTempoServico> = {}): RegraTempoServico => ({
  id: over.id ?? "r1",
  nome: "Triênio",
  escopo: "empresa",
  sindicato_id: null,
  unidade_id: null,
  cargo_id: null,
  ciclo_meses: 36,
  percentual_por_ciclo: 3,
  base: "salario_base",
  max_ciclos: null,
  acumula: true,
  vigencia_inicio: "2020-01-01",
  vigencia_fim: null,
  ativo: true,
  ...over,
});

describe("mesesDeCasa", () => {
  it("conta meses completos", () => {
    expect(mesesDeCasa("2024-01-15", "2026-01-14")).toBe(23);
    expect(mesesDeCasa("2024-01-15", "2026-01-15")).toBe(24);
    expect(mesesDeCasa(null, "2026-01-15")).toBe(0);
  });
});

describe("selecionarRegraTempoServico", () => {
  it("prefere a regra mais específica", () => {
    const regras = [
      regra({ id: "empresa" }),
      regra({ id: "cargo", escopo: "cargo", cargo_id: "c1" }),
    ];
    expect(
      selecionarRegraTempoServico(regras, { cargoId: "c1" }, "2026-01-01")?.id,
    ).toBe("cargo");
  });

  it("ignora regras fora da vigência ou inativas", () => {
    const regras = [
      regra({ id: "velha", vigencia_fim: "2025-12-31" }),
      regra({ id: "off", ativo: false }),
    ];
    expect(selecionarRegraTempoServico(regras, {}, "2026-01-01")).toBeNull();
  });
});

describe("calcularAdicionalTempoServico", () => {
  it("aplica um percentual por ciclo completo", () => {
    const calc = calcularAdicionalTempoServico({
      regra: regra(),
      admissao: "2017-04-01",
      referencia: "2026-08-18",
      base: 2000,
    });
    expect(calc?.ciclos).toBe(3);
    expect(calc?.percentual).toBe(9);
    expect(calc?.valor).toBe(180);
  });

  it("respeita o limite de ciclos e o não acumulável", () => {
    const limitado = calcularAdicionalTempoServico({
      regra: regra({ max_ciclos: 2 }),
      admissao: "2010-01-01",
      referencia: "2026-01-01",
      base: 1000,
    });
    expect(limitado?.percentual).toBe(6);
    expect(limitado?.mesesParaProximo).toBeNull();

    const semAcumulo = calcularAdicionalTempoServico({
      regra: regra({ acumula: false }),
      admissao: "2010-01-01",
      referencia: "2026-01-01",
      base: 1000,
    });
    expect(semAcumulo?.percentual).toBe(3);
  });

  it("retorna nulo sem regra aplicável", () => {
    expect(
      calcularAdicionalTempoServico({
        regra: null,
        admissao: "2020-01-01",
        referencia: "2026-01-01",
        base: 1000,
      }),
    ).toBeNull();
  });
});
