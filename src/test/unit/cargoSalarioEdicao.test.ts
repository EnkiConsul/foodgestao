import { describe, expect, it } from "vitest";
import { diffPiso, validarEdicaoPiso, vigenciasSobrepostas } from "@/lib/dp/cargoSalarios";

const base = {
  id: "linha-1",
  salario_base: 2400,
  vigencia_inicio: "2026-05-01",
  vigencia_fim: null as string | null,
  unidade_id: null as string | null,
  sindicato_patronal_id: "pat-1",
  observacao: null as string | null,
  justificativa: "Correção da data base conforme CCT assinada.",
};

describe("validarEdicaoPiso", () => {
  it("exige justificativa mínima", () => {
    const r = validarEdicaoPiso({ ...base, justificativa: "erro" }, []);
    expect(r).toMatchObject({ ok: false, campo: "justificativa" });
  });
  it("recusa valor zerado", () => {
    expect(validarEdicaoPiso({ ...base, salario_base: 0 }, [])).toMatchObject({
      ok: false, campo: "salario_base",
    });
  });
  it("recusa fim antes do início", () => {
    expect(validarEdicaoPiso({ ...base, vigencia_fim: "2026-04-01" }, [])).toMatchObject({
      ok: false, campo: "vigencia_fim",
    });
  });
  it("recusa sobreposição no mesmo escopo", () => {
    const outras = [
      { id: "linha-2", sindicato_patronal_id: "pat-1", unidade_id: null, salario_base: 2200, vigencia_inicio: "2026-01-01", vigencia_fim: null },
    ];
    expect(validarEdicaoPiso(base, outras)).toMatchObject({ ok: false, campo: "vigencia_inicio" });
  });
  it("aceita quando não há conflito", () => {
    const outras = [
      { id: "linha-2", sindicato_patronal_id: "pat-1", unidade_id: null, salario_base: 2200, vigencia_inicio: "2026-01-01", vigencia_fim: "2026-04-30" },
    ];
    expect(validarEdicaoPiso(base, outras)).toEqual({ ok: true });
  });
  it("ajuste de unidade não pode ficar abaixo do piso do patronal", () => {
    const outras = [
      { id: "piso", sindicato_patronal_id: "pat-1", unidade_id: null, salario_base: 2500, vigencia_inicio: "2026-01-01", vigencia_fim: null },
    ];
    expect(
      validarEdicaoPiso({ ...base, unidade_id: "uni-1", salario_base: 2400 }, outras),
    ).toMatchObject({ ok: false, campo: "salario_base" });
  });
  it("ignora a própria linha ao validar", () => {
    expect(validarEdicaoPiso(base, [{ ...base }])).toEqual({ ok: true });
  });
});

describe("vigenciasSobrepostas", () => {
  it("linhas em aberto sempre se sobrepõem", () => {
    expect(
      vigenciasSobrepostas({ vigencia_inicio: "2026-01-01" }, { vigencia_inicio: "2027-01-01" }),
    ).toBe(true);
  });
  it("períodos separados não se sobrepõem", () => {
    expect(
      vigenciasSobrepostas(
        { vigencia_inicio: "2026-01-01", vigencia_fim: "2026-04-30" },
        { vigencia_inicio: "2026-05-01", vigencia_fim: null },
      ),
    ).toBe(false);
  });
});

describe("diffPiso", () => {
  it("descreve valor e data base alterados", () => {
    const out = diffPiso(
      { salario_base: 2200, vigencia_inicio: "2026-01-01" },
      { salario_base: 2400, vigencia_inicio: "2026-05-01" },
    );
    expect(out).toHaveLength(2);
    expect(out[1]).toContain("data base");
  });
});
