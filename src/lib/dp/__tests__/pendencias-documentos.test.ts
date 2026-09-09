import { describe, it, expect } from "vitest";
import {
  atrasoEmDias,
  competenciaDe,
  competenciaLabel,
  competenciasParaCobrar,
  intervaloCompetencia,
  limiteMesSeguinte,
  limiteNoMes,
  primeiraCompetenciaCobrada,
  somarMeses,
} from "../pendencias-documentos";

describe("pendencias-documentos", () => {
  it("começa uma competência antes do cadastro da unidade", () => {
    expect(primeiraCompetenciaCobrada("2026-06-10T00:00:00Z")).toBe("2026-05");
    const comps = competenciasParaCobrar({ cadastroISO: "2026-06-10", ultima: "2026-08" });
    expect(comps).toEqual(["2026-05", "2026-06", "2026-07", "2026-08"]);
  });

  it("vira o ano corretamente", () => {
    expect(somarMeses("2026-01", -1)).toBe("2025-12");
    expect(somarMeses("2025-12", 2)).toBe("2026-02");
    expect(competenciaDe("2026-09-09")).toBe("2026-09");
  });

  it("calcula data limite no mês seguinte e no próprio mês", () => {
    expect(limiteMesSeguinte("2026-07", 10)).toBe("2026-08-10");
    expect(limiteNoMes("2026-08", 20)).toBe("2026-08-20");
    // dia inexistente é ajustado para o último dia do mês
    expect(limiteNoMes("2026-02", 31)).toBe("2026-02-28");
  });

  it("classifica antes, no dia e depois da data limite", () => {
    expect(atrasoEmDias("2026-09-10", "2026-09-09")).toBe(-1);
    expect(atrasoEmDias("2026-09-10", "2026-09-10")).toBe(0);
    expect(atrasoEmDias("2026-08-10", "2026-09-09")).toBe(30);
  });

  it("dá o intervalo da competência e o rótulo", () => {
    expect(intervaloCompetencia("2026-07")).toEqual({ inicio: "2026-07-01", fim: "2026-07-31" });
    expect(competenciaLabel("2026-07")).toBe("julho/2026");
  });

  it("limita a lista quando o cadastro é muito antigo", () => {
    const comps = competenciasParaCobrar({ cadastroISO: "2015-01-10", ultima: "2026-08", maximo: 6 });
    expect(comps).toHaveLength(6);
    expect(comps[comps.length - 1]).toBe("2026-08");
  });
});
