import { describe, expect, it } from "vitest";
import { elegivelDocumento, isSocio } from "../pendencias-documentos";
import { agruparPorTipo, agruparPorColaborador } from "../pendencias";

const base = { id: "c1", regime: "clt" };

describe("elegibilidade de documentos por colaborador", () => {
  it("contracheque só para regimes assalariados e não sócios", () => {
    expect(elegivelDocumento("contracheque", base)).toBe(true);
    expect(elegivelDocumento("contracheque", { id: "c2", regime: "freelancer" })).toBe(false);
    expect(
      elegivelDocumento("contracheque", { ...base, vinculo_label: "Sócio" }),
    ).toBe(false);
  });

  it("adiantamento só para optantes", () => {
    expect(elegivelDocumento("adiantamento", { ...base, optante_adiantamento: true })).toBe(true);
    expect(elegivelDocumento("adiantamento", base)).toBe(false);
  });

  it("folha de ponto exige relógio na unidade e folha marcada", () => {
    expect(elegivelDocumento("ponto", base, { unidadeTemRelogio: true })).toBe(true);
    expect(elegivelDocumento("ponto", base, { unidadeTemRelogio: false })).toBe(false);
    expect(
      elegivelDocumento("ponto", { ...base, possui_folha_ponto: false }, { unidadeTemRelogio: true }),
    ).toBe(false);
  });

  it("reconhece sócia", () => {
    expect(isSocio({ id: "x", vinculo_label: "SÓCIA" })).toBe(true);
  });
});

const p = (id: string, tipo: string, atrasoDias: number, colaboradorNome?: string) => ({
  id,
  tipo,
  titulo: tipo,
  subtitulo: "",
  atrasoDias,
  vencimento: "2026-07-05",
  colaboradorNome: colaboradorNome ?? null,
});

describe("ordenação por atraso", () => {
  it("grupos por tipo: maior atraso primeiro", () => {
    const g = agruparPorTipo([p("a", "Adiantamento", 2), p("b", "Contracheque", 40)] as any);
    expect(g[0].tipo).toBe("Contracheque");
  });

  it("grupos por colaborador podem ordenar pelo maior atraso", () => {
    const g = agruparPorColaborador(
      [p("a", "Contracheque", 1, "ANA"), p("b", "Contracheque", 30, "ZE")] as any,
      { ordenarPorAtraso: true },
    );
    expect(g[0].colaborador).toBe("ZE");
  });
});
