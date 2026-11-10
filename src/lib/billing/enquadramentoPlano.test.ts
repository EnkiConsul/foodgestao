import { describe, expect, it } from "vitest";
import { avisoPlanoAbaixoDaEquipe, sugerirPlanoPessoas, type PlanoCatalogo } from "./enquadramentoPlano";

// Catálogo definido pela Pakerê: 4 / 8 / 18 colaboradores e Enterprise R$ 10,00 por colaborador (mínimo 19).
const CATALOGO: PlanoCatalogo[] = [
  { slug: "pessoas-enterprise", name: "Pessoas 360° Enterprise", module: "pessoas", sort_order: 4,
    features: { min_collaborators: 19, price_per_collaborator_cents: 1000 } },
  { slug: "pessoas-essencial", name: "Pessoas 360° Essencial", module: "pessoas", sort_order: 1,
    features: { max_collaborators: 4, max_units: 1 } },
  { slug: "pessoas-gestao", name: "Pessoas 360° Gestão", module: "pessoas", sort_order: 2,
    features: { max_collaborators: 8, max_units: 2 } },
  { slug: "pessoas-multiempresa", name: "Pessoas 360° Multiempresa", module: "pessoas", sort_order: 3,
    features: { max_collaborators: 18, max_units: 3 } },
];

const sugere = (colaboradores: number, unidades = 1) => sugerirPlanoPessoas(CATALOGO, { colaboradores, unidades })?.slug;

describe("enquadramento do plano pela equipe no fim do teste", () => {
  it("0 a 4 colaboradores ativos → Essencial", () => {
    expect(sugere(0)).toBe("pessoas-essencial");
    expect(sugere(4)).toBe("pessoas-essencial");
  });
  it("5 a 8 → Gestão", () => {
    expect(sugere(5)).toBe("pessoas-gestao");
    expect(sugere(8)).toBe("pessoas-gestao");
  });
  it("9 a 18 → Multiempresa", () => {
    expect(sugere(9)).toBe("pessoas-multiempresa");
    expect(sugere(18)).toBe("pessoas-multiempresa");
  });
  it("19 ou mais → Enterprise", () => {
    expect(sugere(19)).toBe("pessoas-enterprise");
    expect(sugere(47)).toBe("pessoas-enterprise");
  });
  it("3 colaboradores em 2 unidades → Gestão (Essencial só tem 1 unidade)", () => {
    expect(sugere(3, 2)).toBe("pessoas-gestao");
  });
  it("orienta quando o plano escolhido não comporta a equipe", () => {
    expect(avisoPlanoAbaixoDaEquipe(CATALOGO[1], { colaboradores: 14, unidades: 1 }))
      .toBe("Sua empresa tem 14 colaboradores ativos; o Pessoas 360° Essencial inclui até 4.");
    expect(avisoPlanoAbaixoDaEquipe(CATALOGO[0], { colaboradores: 14, unidades: 1 })).toBeNull();
  });
});
