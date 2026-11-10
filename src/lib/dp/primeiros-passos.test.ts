import { describe, expect, it } from "vitest";
import { primeirosPassosVisivel } from "./primeiros-passos";

describe("primeiros passos", () => {
  it("empresa sem colaboradores sempre vê os primeiros passos", () => {
    expect(primeirosPassosVisivel({ colaboradores: 0, fichasPendentes: 0, criadosPelasFichas: 0 })).toBe(true);
  });
  it("implantação em andamento: 47 fichas, 3 já cadastradas pelas fichas, continua aparecendo", () => {
    expect(primeirosPassosVisivel({ colaboradores: 3, fichasPendentes: 44, criadosPelasFichas: 3 })).toBe(true);
  });
  it("empresa com equipe própria que envia um lote novo não vê os primeiros passos", () => {
    expect(primeirosPassosVisivel({ colaboradores: 30, fichasPendentes: 5, criadosPelasFichas: 0 })).toBe(false);
  });
  it("todas as fichas concluídas: some", () => {
    expect(primeirosPassosVisivel({ colaboradores: 47, fichasPendentes: 0, criadosPelasFichas: 47 })).toBe(false);
  });
});
