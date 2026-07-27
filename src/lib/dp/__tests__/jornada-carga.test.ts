import { describe, it, expect } from "vitest";
import {
  calcularCargaDia,
  calcularCargaTotalCadastrada,
  calcularCargaComFolgaFixa,
  calcularCargaComFolgas,
  calcularCargaDaEscala,
  simularCargaPorDiaDeFolga,
  validarCargaSemanal,
  cargaEstimadaPorRegime,
  folgasPorRegime,
  formatarHoras,
  type HorarioDia,
} from "@/lib/dp/jornada-utils";

const dia = (
  dia_semana: number,
  entrada: string,
  saida: string,
  intervalo_minutos = 60,
): HorarioDia => ({ dia_semana, entrada, saida, intervalo_minutos });

/** 7 dias 08:00–17:00 com 1h de intervalo = 8h/dia => 56h totais. */
const semanaCompleta: HorarioDia[] = [0, 1, 2, 3, 4, 5, 6].map((d) => dia(d, "08:00", "17:00"));

describe("carga de jornada", () => {
  it("desconta o intervalo corretamente", () => {
    expect(calcularCargaDia(dia(1, "08:00", "17:00", 60))).toBe(8);
    expect(calcularCargaDia(dia(1, "08:00", "17:00", 0))).toBe(9);
    expect(calcularCargaDia(dia(1, "08:00", "17:00", 30))).toBe(8.5);
  });

  it("calcula jornada que atravessa a meia-noite", () => {
    expect(calcularCargaDia(dia(1, "17:00", "01:00", 60))).toBe(7);
    expect(calcularCargaDia(dia(1, "22:00", "06:00", 0))).toBe(8);
  });

  it("6x1 com sete dias cadastrados e uma folga fixa", () => {
    expect(calcularCargaTotalCadastrada(semanaCompleta)).toBe(56);
    expect(calcularCargaComFolgaFixa(semanaCompleta, 2)).toBe(48);
    expect(folgasPorRegime("6x1")).toBe(1);
  });

  it("5x2 desconta duas folgas", () => {
    expect(calcularCargaComFolgas(semanaCompleta, [0, 6])).toBe(40);
    expect(folgasPorRegime("5x2")).toBe(2);
  });

  it("folga em dia com carga diferente muda o resultado", () => {
    const horarios = [
      ...[1, 2, 3, 4, 5].map((d) => dia(d, "08:00", "17:00")), // 8h
      dia(6, "08:00", "14:00", 30), // 5,5h
      dia(0, "10:00", "16:00", 0), // 6h
    ];
    expect(calcularCargaTotalCadastrada(horarios)).toBe(51.5);
    expect(calcularCargaComFolgaFixa(horarios, 0)).toBe(45.5);
    expect(calcularCargaComFolgaFixa(horarios, 1)).toBe(43.5);
    const sim = simularCargaPorDiaDeFolga(horarios);
    expect(sim).toHaveLength(7);
    expect(sim.find((s) => s.dia === 6)?.carga).toBe(46);
  });

  it("folga variável: sem folga definida, a carga é a total cadastrada", () => {
    expect(calcularCargaComFolgaFixa(semanaCompleta, null)).toBe(56);
  });

  it("12x36 não tem estimativa por soma semanal", () => {
    const plantoes = [1, 3, 5].map((d) => dia(d, "07:00", "19:00", 60));
    expect(cargaEstimadaPorRegime(plantoes, "12x36")).toBeNull();
    expect(folgasPorRegime("12x36")).toBeNull();
  });

  it("carga efetiva abaixo de 44h não gera excesso", () => {
    const v = validarCargaSemanal(43.98);
    expect(v.excede).toBe(false);
    expect(v.excedente).toBe(0);
  });

  it("carga efetiva acima de 44h gera excesso com excedente", () => {
    const v = validarCargaSemanal(48);
    expect(v.excede).toBe(true);
    expect(v.excedente).toBe(4);
    expect(v.limite).toBe(44);
  });

  it("estimativa por regime devolve faixa mínima e máxima", () => {
    const horarios = [
      ...[1, 2, 3, 4, 5].map((d) => dia(d, "08:00", "17:00")), // 8h
      dia(6, "08:00", "14:00", 30), // 5,5h
      dia(0, "10:00", "16:00", 0), // 6h
    ];
    const est = cargaEstimadaPorRegime(horarios, "6x1");
    expect(est).not.toBeNull();
    expect(est!.folgas).toBe(1);
    expect(est!.minima).toBe(43.5);
    expect(est!.maxima).toBe(46);
  });

  it("carga da escala conta apenas os dias escalados", () => {
    expect(calcularCargaDaEscala(semanaCompleta, [1, 2, 3, 4, 5])).toBe(40);
    expect(calcularCargaDaEscala(semanaCompleta, [])).toBe(0);
  });

  it("formata horas em h/mm", () => {
    expect(formatarHoras(43.98)).toBe("43h59");
    expect(formatarHoras(8)).toBe("8h");
  });
});
