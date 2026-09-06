import { describe, expect, it } from "vitest";
import {
  FRACIONAMENTO_PADRAO,
  avaliarFracionamento,
  descreverFracionamento,
} from "../ferias-fracionamento";

describe("avaliarFracionamento", () => {
  it("aceita período único consumindo todo o direito", () => {
    expect(avaliarFracionamento(30, [], 0).ok).toBe(true);
  });

  it("aceita a primeira parcela grande deixando saldo", () => {
    const r = avaliarFracionamento(15, [], 15);
    expect(r.ok).toBe(true);
    expect(r.totalFracoes).toBe(1);
  });

  it("recusa parcela menor que o mínimo", () => {
    expect(avaliarFracionamento(3, [{ dias: 20 }], 7).codigo).toBe("FERIAS_FRACAO_CURTA");
  });

  it("recusa a primeira parcela curta quando ainda sobra saldo", () => {
    expect(avaliarFracionamento(4, [], 26).codigo).toBe("FERIAS_FRACAO_CURTA");
  });

  it("recusa quando passa do número máximo de períodos", () => {
    const r = avaliarFracionamento(5, [{ dias: 14 }, { dias: 6 }, { dias: 5 }], 0);
    expect(r.codigo).toBe("FERIAS_FRACIONAMENTO_LIMITE");
    expect(r.totalFracoes).toBe(4);
  });

  it("exige um período maior quando o saldo termina", () => {
    expect(avaliarFracionamento(10, [{ dias: 10 }, { dias: 10 }], 0).codigo).toBe(
      "FERIAS_FRACAO_MAIOR_AUSENTE",
    );
  });

  it("aceita quando um dos períodos alcança o mínimo do maior", () => {
    expect(avaliarFracionamento(6, [{ dias: 14 }, { dias: 10 }], 0).ok).toBe(true);
  });

  it("aceita quando o novo período é o maior", () => {
    expect(avaliarFracionamento(20, [{ dias: 5 }, { dias: 5 }], 0).ok).toBe(true);
  });

  it("não cobra o maior período enquanto ainda sobra saldo", () => {
    expect(avaliarFracionamento(5, [{ dias: 5 }], 20).ok).toBe(true);
  });

  it("respeita regra personalizada da empresa", () => {
    const regra = { maxFracoes: 2, minDias: 10, maiorDias: 20 };
    expect(avaliarFracionamento(10, [{ dias: 20 }, { dias: 10 }], 0, regra).codigo).toBe(
      "FERIAS_FRACIONAMENTO_LIMITE",
    );
    expect(avaliarFracionamento(10, [], 20, regra).ok).toBe(true);
  });

  it("ignora dias zerados", () => {
    expect(avaliarFracionamento(0, [{ dias: 30 }], 0).ok).toBe(true);
  });

  it("descreve a regra em texto simples", () => {
    expect(descreverFracionamento(FRACIONAMENTO_PADRAO)).toContain("Até 3 períodos");
    expect(descreverFracionamento({ maxFracoes: 1, minDias: 30, maiorDias: 30 })).toContain(
      "de uma vez só",
    );
  });
});
