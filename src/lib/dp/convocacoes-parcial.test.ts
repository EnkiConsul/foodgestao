import { describe, it, expect } from "vitest";
import {
  formatarMinutos,
  janelaMinutos,
  minutosDoHorario,
  trechosDescobertos,
  validarHorarioParcial,
} from "./convocacoes-parcial";

const necessidade = { entrada: "16:30", saida: "00:20", termina_no_dia_seguinte: true };

describe("minutosDoHorario / janelaMinutos", () => {
  it("aceita HH:MM e HH:MM:SS", () => {
    expect(minutosDoHorario("16:30")).toBe(990);
    expect(minutosDoHorario("16:30:00")).toBe(990);
    expect(minutosDoHorario("xx")).toBeNull();
  });

  it("trata virada de dia", () => {
    expect(janelaMinutos(necessidade)).toEqual({ inicio: 990, fim: 1460 });
    expect(janelaMinutos({ entrada: "08:00", saida: "17:00" })).toEqual({ inicio: 480, fim: 1020 });
  });
});

describe("validarHorarioParcial", () => {
  it("aceita encurtar dentro da janela", () => {
    const r = validarHorarioParcial(necessidade, {
      entrada: "18:00",
      saida: "00:20",
      termina_no_dia_seguinte: true,
    });
    expect(r).toEqual({ ok: true, minutos: 380 });
  });

  it("recusa horário fora da janela pedida", () => {
    expect(
      validarHorarioParcial(necessidade, { entrada: "15:00", saida: "23:00" }),
    ).toEqual({ ok: false, motivo: "FORA_DA_JANELA" });
    expect(
      validarHorarioParcial(necessidade, {
        entrada: "17:00",
        saida: "01:00",
        termina_no_dia_seguinte: true,
      }),
    ).toEqual({ ok: false, motivo: "FORA_DA_JANELA" });
  });

  it("recusa quando é o horário completo", () => {
    expect(
      validarHorarioParcial(necessidade, {
        entrada: "16:30",
        saida: "00:20",
        termina_no_dia_seguinte: true,
      }),
    ).toEqual({ ok: false, motivo: "IGUAL_AO_COMPLETO" });
  });
});

describe("trechosDescobertos", () => {
  it("calcula sobra no início e no fim", () => {
    expect(
      trechosDescobertos(necessidade, {
        entrada: "18:00",
        saida: "23:00",
      }),
    ).toEqual({ inicio: 90, fim: 80, total: 170 });
  });
});

describe("formatarMinutos", () => {
  it("formata horas e minutos", () => {
    expect(formatarMinutos(95)).toBe("1h35");
    expect(formatarMinutos(120)).toBe("2h");
    expect(formatarMinutos(45)).toBe("45min");
    expect(formatarMinutos(null)).toBe("—");
  });
});
