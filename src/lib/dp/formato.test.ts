import { describe, expect, it } from "vitest";
import { dataBr, diaMes, hhmm, somenteDigitos } from "./formato";

describe("formato do módulo Pessoas", () => {
  it("mostra a data no formato brasileiro", () => {
    expect(dataBr("2026-03-09")).toBe("09/03/2026");
    expect(dataBr("2026-03-09T00:00:00Z")).toBe("09/03/2026");
  });

  it("não muda o dia por causa do fuso", () => {
    expect(dataBr("2026-01-01")).toBe("01/01/2026");
    expect(dataBr("2026-12-31")).toBe("31/12/2026");
  });

  it("usa o texto de reserva quando não há data", () => {
    expect(dataBr(null)).toBe("—");
    expect(dataBr(undefined, "Sem data")).toBe("Sem data");
    expect(dataBr("")).toBe("—");
  });

  it("mostra dia e mês", () => {
    expect(diaMes("2026-03-09")).toBe("09/03");
    expect(diaMes(null)).toBe("—");
  });

  it("mostra o horário sem os segundos", () => {
    expect(hhmm("08:00:00")).toBe("08:00");
    expect(hhmm("08:00")).toBe("08:00");
    expect(hhmm(null)).toBe("");
    expect(hhmm(null, "—")).toBe("—");
  });

  it("mantém só os números", () => {
    expect(somenteDigitos("12.345.678/0001-99")).toBe("12345678000199");
    expect(somenteDigitos("(62) 99236-5959")).toBe("62992365959");
  });
});
