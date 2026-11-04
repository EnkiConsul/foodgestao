import { describe, expect, it } from "vitest";
import { opcoesAusencia } from "./ausencia-elegibilidade";

// 2026-11-04 é quarta-feira (3)
const colabs = [
  { id: "a", unidade_id: "u1", folga_fixa_semana: 1, socio: false },
  { id: "b", unidade_id: "u1", folga_fixa_semana: 3, socio: false },
  { id: "s", unidade_id: "u1", folga_fixa_semana: null, socio: true },
  { id: "x", unidade_id: "u2", folga_fixa_semana: 1, socio: false },
];
const base = { data: "2026-11-04", comAusencia: new Set<string>(), ehSocio: (c: any) => c.socio };

describe("opcoesAusencia", () => {
  it("lista só colaboradores da unidade escolhida", () => {
    const r = opcoesAusencia(colabs, { ...base, unidadeId: "u1", motivo: "afastamento" });
    expect(r.map((o) => o.colab.id).sort()).toEqual(["a", "b", "s"]);
  });
  it("sem unidade não lista ninguém", () => {
    expect(opcoesAusencia(colabs, { ...base, unidadeId: null, motivo: "afastamento" })).toEqual([]);
  });
  it("falta bloqueia sócio e quem tem folga prevista no dia", () => {
    const r = opcoesAusencia(colabs, { ...base, unidadeId: "u1", motivo: "falta" });
    expect(r.find((o) => o.colab.id === "s")!.bloqueio).toBeTruthy();
    expect(r.find((o) => o.colab.id === "b")!.bloqueio).toBeTruthy();
    expect(r.find((o) => o.colab.id === "a")!.bloqueio).toBeNull();
  });
  it("atestado permite sócio", () => {
    const r = opcoesAusencia(colabs, { ...base, unidadeId: "u1", motivo: "afastamento" });
    expect(r.find((o) => o.colab.id === "s")!.bloqueio).toBeNull();
  });
});
