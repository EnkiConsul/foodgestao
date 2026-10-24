import { describe, expect, it } from "vitest";
import { podeConcluirAssinatura, proximaPaginaSemRubrica, rubricaObrigatoria } from "../rubrica";

describe("rubrica página a página", () => {
  it("documento de uma página não exige rubrica", () => {
    expect(rubricaObrigatoria(1)).toBe(false);
    expect(rubricaObrigatoria(0)).toBe(false);
  });

  it("documento com duas ou mais páginas exige rubrica", () => {
    expect(rubricaObrigatoria(2)).toBe(true);
    expect(rubricaObrigatoria(12)).toBe(true);
  });

  it("sem assinatura desenhada, nunca libera a conclusão", () => {
    expect(podeConcluirAssinatura(false, 1, 0)).toBe(false);
    expect(podeConcluirAssinatura(false, 5, 5)).toBe(false);
  });

  it("página única conclui só com a assinatura", () => {
    expect(podeConcluirAssinatura(true, 1, 0)).toBe(true);
  });

  it("documento longo fica travado enquanto faltar página rubricada", () => {
    expect(podeConcluirAssinatura(true, 5, 4)).toBe(false);
    expect(podeConcluirAssinatura(true, 5, 0)).toBe(false);
  });

  it("documento longo conclui quando todas as páginas foram rubricadas", () => {
    expect(podeConcluirAssinatura(true, 5, 5)).toBe(true);
  });

  it("aponta a primeira página ainda sem rubrica", () => {
    expect(proximaPaginaSemRubrica(4, new Set([1, 2]))).toBe(3);
    expect(proximaPaginaSemRubrica(4, new Set())).toBe(1);
    expect(proximaPaginaSemRubrica(4, new Set([1, 2, 3, 4]))).toBeNull();
  });
});
