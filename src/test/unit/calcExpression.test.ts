import { describe, it, expect } from "vitest";
import { evaluateExpression, isExpression, normalizeExpression } from "@/lib/calc-expression";

const val = (s: string) => evaluateExpression(s).value;

describe("evaluateExpression", () => {
  it("respeita a precedência", () => {
    expect(val("2+3*4")).toBe(14);
    expect(val("10-4/2")).toBe(8);
  });

  it("resolve parênteses", () => {
    expect(val("(2+3)*4")).toBe(20);
  });

  it("aceita vírgula e ponto como decimal", () => {
    expect(val("12,50*3+8")).toBe(45.5);
    expect(val("12.50*2")).toBe(25);
  });

  it("aceita × e ÷", () => {
    expect(val("3×4")).toBe(12);
    expect(val("12÷4")).toBe(3);
  });

  it("aplica percentual relativo", () => {
    expect(val("100+10%")).toBe(110);
    expect(val("200-25%")).toBe(150);
  });

  it("arredonda em 2 casas", () => {
    expect(val("10/3")).toBe(3.33);
  });

  it("rejeita expressão inválida", () => {
    expect(evaluateExpression("2++").ok).toBe(false);
    expect(evaluateExpression("(2+3").ok).toBe(false);
    expect(evaluateExpression("abc").ok).toBe(false);
    expect(evaluateExpression("").ok).toBe(false);
  });

  it("rejeita divisão por zero", () => {
    expect(evaluateExpression("10/0").ok).toBe(false);
  });

  it("resolve número simples", () => {
    expect(val("15,90")).toBe(15.9);
  });
});

describe("normalizeExpression", () => {
  it("usa símbolos legíveis", () => {
    expect(normalizeExpression("12,5*3+8")).toBe("12,5 × 3 + 8");
  });
});

describe("isExpression", () => {
  it("detecta operadores", () => {
    expect(isExpression("12,50*3")).toBe(true);
    expect(isExpression("1500,00")).toBe(false);
    expect(isExpression("-50,00")).toBe(false);
  });
});
