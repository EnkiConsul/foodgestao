import { describe, it, expect } from "vitest";
import {
  mesCivil, intervaloCorte, competenciaDe, intervaloAtual, competenciaDoIntervalo,
  intervaloDePeriodo, deslocarMes, hojeSaoPaulo, lerCorte,
} from "./ocorrenciasPeriodo";

const dentro = (d: string, i: { inicio: string; fim: string }) => d >= i.inicio && d <= i.fim;

describe("mês civil", () => {
  it("fevereiro comum e bissexto, abril, outubro", () => {
    expect(mesCivil(2026, 2)).toEqual({ inicio: "2026-02-01", fim: "2026-02-28" });
    expect(mesCivil(2028, 2)).toEqual({ inicio: "2028-02-01", fim: "2028-02-29" });
    expect(mesCivil(2026, 4)).toEqual({ inicio: "2026-04-01", fim: "2026-04-30" });
    expect(mesCivil(2026, 10)).toEqual({ inicio: "2026-10-01", fim: "2026-10-31" });
  });
});

describe("corte da folha", () => {
  it("26 a 25 de outubro/2026", () => {
    expect(intervaloCorte(2026, 10, 26)).toEqual({ inicio: "2026-09-26", fim: "2026-10-25" });
  });
  it("virada de ano (janeiro)", () => {
    expect(intervaloCorte(2027, 1, 26)).toEqual({ inicio: "2026-12-26", fim: "2027-01-25" });
  });
  it("março após fevereiro bissexto e comum", () => {
    expect(intervaloCorte(2028, 3, 26)).toEqual({ inicio: "2028-02-26", fim: "2028-03-25" });
    expect(intervaloCorte(2026, 3, 2)).toEqual({ inicio: "2026-02-02", fim: "2026-03-01" });
  });
  it("corte 2 a 1 e 28 a 27", () => {
    expect(intervaloCorte(2026, 5, 2)).toEqual({ inicio: "2026-04-02", fim: "2026-05-01" });
    expect(intervaloCorte(2026, 3, 28)).toEqual({ inicio: "2026-02-28", fim: "2026-03-27" });
  });
  it("limites: primeiro/último incluídos, vizinhos fora", () => {
    const i = intervaloCorte(2026, 10, 26);
    expect(dentro("2026-09-26", i)).toBe(true);
    expect(dentro("2026-10-25", i)).toBe(true);
    expect(dentro("2026-09-25", i)).toBe(false);
    expect(dentro("2026-10-26", i)).toBe(false);
  });
  it("competências consecutivas não se sobrepõem nem deixam buracos", () => {
    for (let m = 1; m <= 24; m++) {
      const a = deslocarMes(2026, 1, m - 1), b = deslocarMes(2026, 1, m);
      const ia = intervaloCorte(a.ano, a.mes, 26), ib = intervaloCorte(b.ano, b.mes, 26);
      const [y, mm, d] = ia.fim.split("-").map(Number);
      const seguinte = new Date(Date.UTC(y, mm - 1, d + 1)).toISOString().slice(0, 10);
      expect(ib.inicio).toBe(seguinte);
    }
  });
});

describe("competência e Hoje", () => {
  it("data no corte 26 cai na competência certa", () => {
    expect(competenciaDe("2026-10-25", 26)).toBe("2026-10");
    expect(competenciaDe("2026-10-26", 26)).toBe("2026-11");
    expect(competenciaDe("2026-12-28", 26)).toBe("2027-01");
    expect(competenciaDe("2026-10-31", 0)).toBe("2026-10");
  });
  it("Hoje respeita o corte ativo", () => {
    expect(intervaloAtual(26, "2026-10-16")).toEqual({ inicio: "2026-09-26", fim: "2026-10-25" });
    expect(intervaloAtual(26, "2026-10-27")).toEqual({ inicio: "2026-10-26", fim: "2026-11-25" });
    expect(intervaloAtual(0, "2026-10-16")).toEqual({ inicio: "2026-10-01", fim: "2026-10-31" });
  });
  it("reconhece o intervalo como competência", () => {
    expect(competenciaDoIntervalo({ inicio: "2026-09-26", fim: "2026-10-25" }, 26)).toBe("2026-10");
    expect(competenciaDoIntervalo({ inicio: "2026-10-01", fim: "2026-10-31" }, 0)).toBe("2026-10");
    expect(competenciaDoIntervalo({ inicio: "2026-10-03", fim: "2026-10-10" }, 26)).toBeNull();
  });
  it("navegação dezembro↔janeiro", () => {
    expect(deslocarMes(2026, 12, 1)).toEqual({ ano: 2027, mes: 1 });
    expect(deslocarMes(2027, 1, -1)).toEqual({ ano: 2026, mes: 12 });
  });
  it("corte salvo inválido vira mês civil", () => {
    expect(lerCorte("26")).toBe(26);
    expect(lerCorte("1")).toBe(0);
    expect(lerCorte("29")).toBe(0);
    expect(lerCorte(null)).toBe(0);
    expect(lerCorte("abc")).toBe(0);
  });
});

describe("fusos", () => {
  it("hoje de São Paulo é igual para o mesmo instante, qualquer fuso", () => {
    // 16/10/2026 00:30 UTC = 15/10 21:30 em São Paulo
    expect(hojeSaoPaulo(new Date("2026-10-16T00:30:00Z"))).toBe("2026-10-15");
    expect(hojeSaoPaulo(new Date("2026-10-16T03:30:00Z"))).toBe("2026-10-16");
  });
  it("período mês/semana/hoje só depende da data civil", () => {
    expect(intervaloDePeriodo("mes", undefined, "2026-10-31")).toEqual({ inicio: "2026-10-01", fim: "2026-10-31" });
    expect(intervaloDePeriodo("hoje", undefined, "2026-10-15")).toEqual({ inicio: "2026-10-15", fim: "2026-10-15" });
    expect(intervaloDePeriodo("semana", undefined, "2026-10-15")).toEqual({ inicio: "2026-10-11", fim: "2026-10-17" });
    expect(intervaloDePeriodo("personalizado", { inicio: "2026-10-03", fim: null })).toEqual({ inicio: "2026-10-03", fim: "2026-10-03" });
    expect(intervaloDePeriodo("todas")).toEqual({});
  });
});
