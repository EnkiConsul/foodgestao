import { describe, expect, it } from "vitest";
import {
  averageTicket,
  formatCents,
  formatDurationSeconds,
  maskName,
  maskPhone,
  rowsToCsv,
} from "@/lib/orders/reports";

describe("relatórios de pedidos", () => {
  it("formata centavos em reais", () => {
    expect(formatCents(12345)).toContain("123,45");
    expect(formatCents(null)).toContain("0,00");
  });

  it("formata durações", () => {
    expect(formatDurationSeconds(0)).toBe("—");
    expect(formatDurationSeconds(45)).toBe("45s");
    expect(formatDurationSeconds(600)).toBe("10 min");
    expect(formatDurationSeconds(7200)).toBe("2.0 h");
  });

  it("mascara telefone mantendo apenas os 4 últimos dígitos", () => {
    expect(maskPhone("(62) 99236-5959")).toBe("••••5959");
    expect(maskPhone("12")).toBeNull();
    expect(maskPhone(null)).toBeNull();
  });

  it("mascara nome preservando o primeiro nome", () => {
    expect(maskName("Maria Aparecida Souza")).toBe("Maria A.");
    expect(maskName("Silvio")).toBe("Silvio");
    expect(maskName("   ")).toBeNull();
  });

  it("gera CSV com separador ponto e vírgula e escapa aspas", () => {
    const csv = rowsToCsv([{ a: 1, b: 'diz "oi"' }]);
    expect(csv.split("\n")[0]).toBe("a;b");
    expect(csv).toContain('"diz ""oi"""');
    expect(rowsToCsv([])).toBe("");
  });

  it("calcula ticket médio ignorando divisão por zero", () => {
    expect(averageTicket(10000, 4)).toBe(2500);
    expect(averageTicket(10000, 0)).toBe(0);
  });
});
