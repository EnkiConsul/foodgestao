import { describe, expect, it } from "vitest";
import { addMoney, fromCents, subtractMoney, sumMoney, toCents } from "@/lib/money";

describe("money", () => {
  it("converte reais em centavos com arredondamento seguro", () => {
    expect(toCents(49.9)).toBe(4990);
    expect(toCents(10.005)).toBe(1001);
    expect(toCents(-12.34)).toBe(-1234);
    expect(toCents(null)).toBe(0);
    expect(toCents(Number.NaN)).toBe(0);
  });

  it("converte centavos de volta para reais", () => {
    expect(fromCents(4990)).toBe(49.9);
    expect(fromCents(-1234)).toBe(-12.34);
    expect(fromCents(Number.NaN)).toBe(0);
  });

  it("soma sem desvio de ponto flutuante", () => {
    expect(0.1 + 0.2).not.toBe(0.3);
    expect(sumMoney([0.1, 0.2])).toBe(0.3);
    expect(sumMoney([1.1, 2.2, 3.3])).toBe(6.6);
    expect(sumMoney([])).toBe(0);
  });

  it("soma listas longas mantendo o centavo exato", () => {
    const rows = Array.from({ length: 1000 }, () => 0.07);
    expect(sumMoney(rows)).toBe(70);
  });

  it("subtrai e adiciona com precisão de centavos", () => {
    expect(subtractMoney(0.3, 0.1)).toBe(0.2);
    expect(subtractMoney(119.99, 19.99)).toBe(100);
    expect(addMoney(0.07, 0.01)).toBe(0.08);
  });

  it("ignora valores nulos na soma", () => {
    expect(sumMoney([10, null, undefined, 5.5])).toBe(15.5);
  });
});
