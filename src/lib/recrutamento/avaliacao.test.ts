import { describe, expect, it } from "vitest";
import { segundosRestantes } from "./avaliacao";

describe("prazo da pergunta vem do servidor", () => {
  const prazo = "2026-10-20T12:01:00.000Z";
  const agora = new Date("2026-10-20T12:00:00.000Z").getTime();
  it("60 segundos restantes com relógios iguais", () => {
    expect(segundosRestantes(prazo, 0, agora)).toBe(60);
  });
  it("relógio do aparelho atrasado 30s não ganha tempo extra", () => {
    expect(segundosRestantes(prazo, 30_000, agora - 30_000)).toBe(60);
  });
  it("nunca fica negativo após o prazo", () => {
    expect(segundosRestantes(prazo, 0, agora + 120_000)).toBe(0);
  });
});
