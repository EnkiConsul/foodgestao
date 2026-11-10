import { describe, expect, it } from "vitest";
import { avisoPlanoAbaixoDaEquipe, enquadrarPlanoPessoas, sugerirPlanoPessoas, type PlanoCatalogo } from "./enquadramentoPlano";

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
    expect(avisoPlanoAbaixoDaEquipe(CATALOGO[0], { colaboradores: 25, unidades: 1 })).toBeNull();
  });
});

describe("Enterprise só a partir de 19 colaboradores ativos (Pakerê, 10/11/2026)", () => {
  it("25 colaboradores em 2 unidades → Enterprise (R$ 10 por colaborador)", () => {
    expect(sugere(25, 2)).toBe("pessoas-enterprise");
  });
  it("8 colaboradores em 5 unidades → sob consulta, nunca Enterprise a R$ 10", () => {
    const e = enquadrarPlanoPessoas(CATALOGO, { colaboradores: 8, unidades: 5 });
    expect(e?.tipo).toBe("sob_consulta");
    expect(sugere(8, 5)).toBeUndefined();
  });
  it("18 colaboradores em 4 unidades → sob consulta (abaixo de 19)", () => {
    expect(enquadrarPlanoPessoas(CATALOGO, { colaboradores: 18, unidades: 4 })?.tipo).toBe("sob_consulta");
  });
  it("19 colaboradores em 4 unidades → Enterprise", () => {
    expect(sugere(19, 4)).toBe("pessoas-enterprise");
  });
  it("3 colaboradores em 1 unidade → Essencial", () => {
    expect(sugere(3, 1)).toBe("pessoas-essencial");
  });
  it("7 colaboradores em 2 unidades → Gestão", () => {
    expect(sugere(7, 2)).toBe("pessoas-gestao");
  });
  it("15 colaboradores em 3 unidades → Multiempresa", () => {
    expect(sugere(15, 3)).toBe("pessoas-multiempresa");
  });
  it("a decisão do servidor prevalece sobre a contagem da tela", () => {
    expect(sugerirPlanoPessoas(CATALOGO, { colaboradores: 25, unidades: 1, enterpriseLiberado: false })).toBeNull();
    expect(sugerirPlanoPessoas(CATALOGO, { colaboradores: 5, unidades: 5, enterpriseLiberado: true })?.slug).toBe("pessoas-enterprise");
  });
  it("escolher o Enterprise abaixo de 19 orienta o contato comercial", () => {
    expect(avisoPlanoAbaixoDaEquipe(CATALOGO[0], { colaboradores: 14, unidades: 1 }))
      .toBe("O Pessoas 360° Enterprise é contratado direto a partir de 19 colaboradores ativos. Para a sua equipe, fale com nosso especialista.");
  });
});

