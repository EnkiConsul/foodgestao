import { describe, expect, it } from "vitest";
import { dataEmAfastamento, folgasOfertaveis, type PeriodoAfastamento } from "../troca-oferta";

const periodos: PeriodoAfastamento[] = [
  { colaborador_id: "a", inicio: "2026-10-05", fim: "2026-10-09" }, // atestado seg–sex
  { colaborador_id: "b", inicio: "2026-10-01", fim: "2026-10-30" }, // férias
];

describe("dataEmAfastamento", () => {
  it("detecta data dentro do período de afastamento", () => {
    expect(dataEmAfastamento(periodos, "a", "2026-10-07")).toBe(true);
    expect(dataEmAfastamento(periodos, "a", "2026-10-05")).toBe(true); // início inclusivo
    expect(dataEmAfastamento(periodos, "a", "2026-10-09")).toBe(true); // fim inclusivo
  });

  it("libera datas fora do período", () => {
    expect(dataEmAfastamento(periodos, "a", "2026-10-04")).toBe(false);
    expect(dataEmAfastamento(periodos, "a", "2026-10-10")).toBe(false);
  });

  it("não mistura afastamento de outra pessoa", () => {
    expect(dataEmAfastamento(periodos, "c", "2026-10-07")).toBe(false);
  });

  it("sem períodos ou sem colaborador, nada bloqueia", () => {
    expect(dataEmAfastamento([], "a", "2026-10-07")).toBe(false);
    expect(dataEmAfastamento(null, "a", "2026-10-07")).toBe(false);
    expect(dataEmAfastamento(periodos, null, "2026-10-07")).toBe(false);
  });
});

describe("folgasOfertaveis + afastamento", () => {
  const folgas = [
    { id: "1", colaborador_id: "a", data: "2026-10-07", status: "agendada" }, // em atestado
    { id: "2", colaborador_id: "a", data: "2026-10-14", status: "agendada" }, // livre
  ];

  it("a folga em afastamento sai da lista ao combinar os filtros", () => {
    const ofertaveis = folgasOfertaveis(folgas, { meuId: "a", hojeIso: "2026-10-01" }).filter(
      (f) => !dataEmAfastamento(periodos, "a", f.data),
    );
    expect(ofertaveis.map((f) => f.id)).toEqual(["2"]);
  });
});
