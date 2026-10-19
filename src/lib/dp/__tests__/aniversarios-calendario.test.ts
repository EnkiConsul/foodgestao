import { describe, expect, it } from "vitest";
import { aniversarioNoPeriodo } from "../aniversarios-calendario";

describe("Aniversários no calendário e resumo", () => {
  const hoje = new Date(2026, 9, 19, 12);
  it("preserva os próximos 30 dias no resumo", () => {
    expect(aniversarioNoPeriodo("1990-11-18", undefined, hoje)?.faltamDias).toBe(30);
    expect(aniversarioNoPeriodo("1990-11-19", undefined, hoje)).toBeNull();
  });
  it("inclui aniversários passados do mês consultado com idade correta", () => {
    expect(aniversarioNoPeriodo("1990-10-03", "2026-10", hoje)).toMatchObject({ anosCompletos: 36, diaMes: "03/10", faltamDias: -16 });
  });
  it("inclui contratação no ano consultado sem depender do mês atual", () => {
    expect(aniversarioNoPeriodo("2020-12-31", "2027-12", hoje)).toMatchObject({ anosCompletos: 7, diaMes: "31/12" });
    expect(aniversarioNoPeriodo("2020-12-31", "2027-11", hoje)).toBeNull();
  });
});