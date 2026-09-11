import { describe, expect, it } from "vitest";
import { afastamentoCobreCompetencia } from "@/lib/dp/licencas";

describe("afastamentoCobreCompetencia", () => {
  const licenca = { afastamentoInicio: "2026-02-01", afastamentoFim: "2026-06-01" };

  it("cobre fevereiro inteiro", () => {
    expect(afastamentoCobreCompetencia({ competencia: "2026-02", ...licenca })).toBe(true);
  });

  it("cobre maio inteiro", () => {
    expect(afastamentoCobreCompetencia({ competencia: "2026-05", ...licenca })).toBe(true);
  });

  it("não cobre junho inteiro", () => {
    expect(afastamentoCobreCompetencia({ competencia: "2026-06", ...licenca })).toBe(false);
  });

  it("não cobre janeiro (antes do início)", () => {
    expect(afastamentoCobreCompetencia({ competencia: "2026-01", ...licenca })).toBe(false);
  });

  it("considera a admissão no meio do mês", () => {
    expect(
      afastamentoCobreCompetencia({
        competencia: "2026-01",
        afastamentoInicio: "2026-01-20",
        afastamentoFim: "2026-05-19",
        admissao: "2026-01-20",
      }),
    ).toBe(true);
  });
});
