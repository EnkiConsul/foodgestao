import { describe, it, expect } from "vitest";
import { alternarArea, destinoSeguro, MAX_AREAS } from "./candidato";

describe("áreas de interesse", () => {
  it("permite no máximo 3 áreas", () => {
    expect(MAX_AREAS).toBe(3);
    expect(alternarArea(["cozinha", "salao", "bar"], "caixa")).toEqual(["cozinha", "salao", "bar"]);
  });
  it("desmarca uma área já escolhida", () => {
    expect(alternarArea(["cozinha", "salao"], "cozinha")).toEqual(["salao"]);
  });
});

describe("retorno após login", () => {
  it("volta para a vaga", () => {
    expect(destinoSeguro("/vagas/45af09d3")).toBe("/vagas/45af09d3");
  });
  it("recusa endereço externo ou área da empresa", () => {
    expect(destinoSeguro("https://mal.com")).toBe("/candidato");
    expect(destinoSeguro("//mal.com")).toBe("/candidato");
    expect(destinoSeguro("/hub")).toBe("/candidato");
  });
});
