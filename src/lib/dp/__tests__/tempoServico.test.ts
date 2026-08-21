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

describe("regras concorrentes: escada x cumulativo", () => {
  const trienio = regra({ id: "t", nome: "Triênio", ciclo_meses: 36, percentual_por_ciclo: 3, acumula: false });
  const quinquenio = regra({ id: "q", nome: "Quinquênio", ciclo_meses: 60, percentual_por_ciclo: 5, acumula: false });
  const regras = [trienio, quinquenio];

  it("escada: com 9 anos de casa vence o quinquênio", () => {
    expect(
      selecionarRegraTempoServico(regras, {}, "2026-08-20", "2017-04-01")?.id,
    ).toBe("q");
    const total = calcularAdicionalPorModo({
      regras, alvo: {}, admissao: "2017-04-01", referencia: "2026-08-20", base: 2000, modo: "escada",
    });
    expect(total.percentual).toBe(5);
    expect(total.valor).toBe(100);
    expect(total.itens).toHaveLength(1);
  });

  it("escada: com 4 anos de casa fica no triênio", () => {
    const total = calcularAdicionalPorModo({
      regras, alvo: {}, admissao: "2022-08-20", referencia: "2026-08-20", base: 2000, modo: "escada",
    });
    expect(total.percentual).toBe(3);
    expect(total.itens[0].regra.id).toBe("t");
  });

  it("cumulativo: com 9 anos soma triênio e quinquênio", () => {
    const total = calcularAdicionalPorModo({
      regras, alvo: {}, admissao: "2017-04-01", referencia: "2026-08-20", base: 2000, modo: "cumulativo",
    });
    expect(total.percentual).toBe(8);
    expect(total.valor).toBe(160);
    expect(total.itens).toHaveLength(2);
  });

  it("sem ciclo completo não gera adicional em nenhum modo", () => {
    for (const modo of ["escada", "cumulativo"] as const) {
      const total = calcularAdicionalPorModo({
        regras, alvo: {}, admissao: "2025-08-20", referencia: "2026-08-20", base: 2000, modo,
      });
      expect(total.percentual).toBe(0);
      expect(total.itens).toHaveLength(0);
    }
  });

  it("cumulativo respeita max_ciclos e acumula de cada regra", () => {
    const total = calcularAdicionalPorModo({
      regras: [regra({ id: "a", ciclo_meses: 12, percentual_por_ciclo: 1, acumula: true, max_ciclos: 3 })],
      alvo: {},
      admissao: "2010-01-01",
      referencia: "2026-01-01",
      base: 1000,
      modo: "cumulativo",
    });
    expect(total.percentual).toBe(3);
  });

  it("usa o piso do cargo quando a regra manda", () => {
    const total = calcularAdicionalPorModo({
      regras: [regra({ base: "piso_cargo" })],
      alvo: {},
      admissao: "2017-04-01",
      referencia: "2026-08-20",
      base: 1000,
      pisoCargo: 2000,
      modo: "escada",
    });
    expect(total.valor).toBe(60);
  });
});
