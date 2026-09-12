import { describe, expect, it } from "vitest";
import { proximaAbaIndex } from "../tabSwipe";

describe("proximaAbaIndex", () => {
  const nenhuma = [false, false, false, false];

  it("arrastar para a esquerda avança para a próxima aba", () => {
    expect(proximaAbaIndex(nenhuma, 0, "esquerda")).toBe(1);
    expect(proximaAbaIndex(nenhuma, 2, "esquerda")).toBe(3);
  });

  it("arrastar para a direita volta para a aba anterior", () => {
    expect(proximaAbaIndex(nenhuma, 3, "direita")).toBe(2);
    expect(proximaAbaIndex(nenhuma, 1, "direita")).toBe(0);
  });

  it("pula abas desabilitadas", () => {
    const comDesabilitada = [false, true, true, false];
    expect(proximaAbaIndex(comDesabilitada, 0, "esquerda")).toBe(3);
    expect(proximaAbaIndex(comDesabilitada, 3, "direita")).toBe(0);
  });

  it("para nas pontas, sem laço infinito", () => {
    expect(proximaAbaIndex(nenhuma, 3, "esquerda")).toBe(-1);
    expect(proximaAbaIndex(nenhuma, 0, "direita")).toBe(-1);
  });

  it("retorna -1 quando todas as demais estão desabilitadas", () => {
    expect(proximaAbaIndex([false, true, true], 0, "esquerda")).toBe(-1);
  });

  it("índice ativo inválido não troca de aba", () => {
    expect(proximaAbaIndex(nenhuma, -1, "esquerda")).toBe(-1);
    expect(proximaAbaIndex(nenhuma, 9, "esquerda")).toBe(-1);
  });
});
