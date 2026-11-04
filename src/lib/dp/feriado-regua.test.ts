import { describe, it, expect } from "vitest";
import { etapaFeriado } from "./feriado-regua";

describe("régua do feriado", () => {
  it("10 dias antes pede revisão", () => expect(etapaFeriado("2026-11-05", "2026-11-15")).toBe("revisao"));
  it("5 dias antes é o último aviso", () => expect(etapaFeriado("2026-11-10", "2026-11-15")).toBe("ultimo_aviso"));
  it("4 dias antes é convocação definitiva", () => expect(etapaFeriado("2026-11-11", "2026-11-15")).toBe("convocacao_definitiva"));
  it("11 dias antes ainda não alerta", () => expect(etapaFeriado("2026-11-04", "2026-11-15")).toBeNull());
});

import { proximoFechamento, etapaFechamento } from "./feriado-regua";
describe("régua do fechamento da escala", () => {
  it("antes do dia 22 fecha neste mês e a competência é o mês seguinte", () =>
    expect(proximoFechamento("2026-11-12", 22)).toEqual({ fechamento: "2026-11-22", competencia: "2026-12" }));
  it("depois do dia 22 vai para o mês seguinte", () =>
    expect(proximoFechamento("2026-12-23", 22)).toEqual({ fechamento: "2027-01-22", competencia: "2027-02" }));
  it("dia 12 é D-10", () => expect(etapaFechamento("2026-11-12", "2026-11-22")).toBe("d10"));
  it("dia 17 é D-5", () => expect(etapaFechamento("2026-11-17", "2026-11-22")).toBe("d5"));
  it("dia 21 é D-1", () => expect(etapaFechamento("2026-11-21", "2026-11-22")).toBe("d1"));
  it("dia 15 não avisa", () => expect(etapaFechamento("2026-11-15", "2026-11-22")).toBeNull());
});
