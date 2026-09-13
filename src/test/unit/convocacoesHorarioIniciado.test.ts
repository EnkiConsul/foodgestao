import { describe, it, expect } from "vitest";
import {
  diaSemHorarioPossivel,
  horarioJaComecou,
} from "@/lib/dp/convocacoes-planejamento";

const agora = new Date(2026, 8, 12, 20, 54, 0); // 12/09/2026 20:54 local

describe("horarioJaComecou", () => {
  it("detecta entrada de hoje que já passou", () => {
    expect(horarioJaComecou("2026-09-12", "16:30", agora)).toBe(true);
  });

  it("aceita entrada de hoje ainda por vir", () => {
    expect(horarioJaComecou("2026-09-12", "23:00", agora)).toBe(false);
  });

  it("usa margem de 5 minutos na borda", () => {
    expect(horarioJaComecou("2026-09-12", "20:56", agora)).toBe(true);
    expect(horarioJaComecou("2026-09-12", "21:10", agora)).toBe(false);
  });

  it("dia futuro nunca começou", () => {
    expect(horarioJaComecou("2026-09-13", "06:00", agora)).toBe(false);
  });

  it("sem entrada não bloqueia", () => {
    expect(horarioJaComecou("2026-09-12", "", agora)).toBe(false);
  });
});

describe("diaSemHorarioPossivel", () => {
  it("hoje ainda cabe horário antes das 23:59", () => {
    expect(diaSemHorarioPossivel("2026-09-12", agora)).toBe(false);
  });

  it("hoje encerrado quando já passou das 23:59", () => {
    expect(diaSemHorarioPossivel("2026-09-12", new Date(2026, 8, 12, 23, 58))).toBe(true);
  });

  it("dia passado está encerrado", () => {
    expect(diaSemHorarioPossivel("2026-09-11", agora)).toBe(true);
  });

  it("dia futuro está livre", () => {
    expect(diaSemHorarioPossivel("2026-09-20", agora)).toBe(false);
  });
});
