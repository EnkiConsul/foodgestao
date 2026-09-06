import { describe, expect, it } from "vitest";
import { acoesGestorTroca, textoDecisaoGestor } from "@/lib/dp/troca-acoes";

describe("acoesGestorTroca", () => {
  it("nunca permite aprovar enquanto aguarda o colega", () => {
    expect(acoesGestorTroca("pendente_colega", "aprovacao_admin")).toEqual({
      aprovar: false,
      recusar: true,
      cancelar: false,
    });
  });

  it("permite aprovar quando a unidade exige aprovação do gestor", () => {
    expect(acoesGestorTroca("pendente_gestor", "aprovacao_admin").aprovar).toBe(true);
  });

  it("não permite aprovar quando a troca é direta entre colegas", () => {
    const acoes = acoesGestorTroca("pendente_gestor", "direta");
    expect(acoes.aprovar).toBe(false);
    expect(acoes.recusar).toBe(true);
  });

  it("permite cancelar apenas trocas aprovadas", () => {
    expect(acoesGestorTroca("aprovada", "direta")).toEqual({
      aprovar: false,
      recusar: false,
      cancelar: true,
    });
    expect(acoesGestorTroca("recusada", "aprovacao_admin").cancelar).toBe(false);
    expect(acoesGestorTroca("cancelada", "aprovacao_admin").cancelar).toBe(false);
  });

  it("troca expirada não aceita nenhuma ação do gestor", () => {
    expect(acoesGestorTroca("expirada", "aprovacao_admin")).toEqual({
      aprovar: false,
      recusar: false,
      cancelar: false,
    });
    expect(acoesGestorTroca("expirada", "direta")).toEqual({
      aprovar: false,
      recusar: false,
      cancelar: false,
    });
  });
});

describe("textoDecisaoGestor", () => {
  it("remove o prefixo do status", () => {
    expect(textoDecisaoGestor("recusada: sem cobertura")).toBe("sem cobertura");
    expect(textoDecisaoGestor("cancelada: erro de data")).toBe("erro de data");
    expect(textoDecisaoGestor("expirada: sem resposta até o fim do dia 05/09/2026")).toBe(
      "sem resposta até o fim do dia 05/09/2026",
    );
  });

  it("ignora respostas sem justificativa", () => {
    expect(textoDecisaoGestor("aprovada")).toBeNull();
    expect(textoDecisaoGestor("recusada")).toBeNull();
    expect(textoDecisaoGestor("expirada")).toBeNull();
    expect(textoDecisaoGestor(null)).toBeNull();
  });
});
