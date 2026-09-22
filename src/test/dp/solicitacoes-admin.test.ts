import { describe, it, expect } from "vitest";
import { somaDias, periodoAfastamento } from "@/lib/dp/solicitacoes-admin";

describe("Período do afastamento", () => {
  it("soma dias sem pular o fuso", () => {
    expect(somaDias("2026-02-27", 2)).toBe("2026-03-01");
    expect(somaDias("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("um dia de atestado começa e termina no mesmo dia", () => {
    expect(periodoAfastamento("2026-05-10", 0)).toEqual({
      data_alvo: "2026-05-10",
      data_fim: "2026-05-10",
    });
  });

  it("três dias terminam no terceiro dia seguinte", () => {
    expect(periodoAfastamento("2026-05-10", 3)).toEqual({
      data_alvo: "2026-05-10",
      data_fim: "2026-05-13",
    });
  });

  it("valor inválido não gera período aberto", () => {
    expect(periodoAfastamento("2026-05-10", Number.NaN).data_fim).toBe("2026-05-10");
    expect(periodoAfastamento("2026-05-10", -5).data_fim).toBe("2026-05-10");
  });
});
