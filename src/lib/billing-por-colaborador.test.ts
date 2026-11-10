import { describe, expect, it } from "vitest";
import { mensalidadePorColaborador, precoPorColaborador } from "./billing";

const ENTERPRISE = { price_per_collaborator_cents: 1000, min_collaborators: 19, accountant_seats: 1 };

describe("Enterprise do Pessoas: R$ 10,00 por colaborador ativo", () => {
  it("base começa no 19º colaborador: 19 × R$ 10,00 = R$ 190,00", () => {
    expect(precoPorColaborador(ENTERPRISE)).toEqual({ unitarioCents: 1000, minimo: 19, baseCents: 19000 });
  });
  it("44 ativos custam R$ 440,00", () => {
    expect(mensalidadePorColaborador(ENTERPRISE, 44)).toBe(44000);
  });
  it("abaixo de 19 ativos cobra a base de R$ 190,00", () => {
    expect(mensalidadePorColaborador(ENTERPRISE, 10)).toBe(19000);
  });
  it("planos de franquia fixa não são por colaborador", () => {
    expect(precoPorColaborador({ max_collaborators: 18 })).toBeNull();
  });
});
