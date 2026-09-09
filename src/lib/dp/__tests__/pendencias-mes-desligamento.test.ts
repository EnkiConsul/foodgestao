import { describe, expect, it } from "vitest";
import { elegivelDocumento } from "../pendencias-documentos";
import { computeCoverage } from "../bulk-coverage";

// Karine: CLT, admitida em 07/05/2026, desligada em 02/07/2026.
const karine = {
  id: "k1",
  nome: "KARINE COSTA DA SILVA",
  regime: "clt",
  ativo: false,
  unidade_id: "u1",
  data_admissao: "2026-05-07",
  data_desligamento: "2026-07-02",
  possui_folha_ponto: true,
  optante_adiantamento: true,
};

describe("mês do desligamento: rescisão no lugar do contracheque", () => {
  it("não cobra contracheque na competência do desligamento", () => {
    expect(elegivelDocumento("contracheque", karine, { competencia: "2026-07" })).toBe(false);
    expect(elegivelDocumento("contracheque", karine, { competencia: "2026-06" })).toBe(true);
  });

  it("cobra contracheque no mês do desligamento quando a empresa exige", () => {
    expect(
      elegivelDocumento("contracheque", karine, {
        competencia: "2026-07",
        exigirContrachequeMesDesligamento: true,
      }),
    ).toBe(true);
  });

  it("cobra rescisão só na competência do desligamento", () => {
    expect(elegivelDocumento("rescisao", karine, { competencia: "2026-07" })).toBe(true);
    expect(elegivelDocumento("rescisao", karine, { competencia: "2026-06" })).toBe(false);
  });

  it("folha de ponto segue exigida no mês do desligamento", () => {
    expect(
      elegivelDocumento("ponto", karine, { competencia: "2026-07", unidadeTemRelogio: true }),
    ).toBe(true);
  });

  it("adiantamento só se o desligamento for a partir do dia de pagamento", () => {
    expect(
      elegivelDocumento("adiantamento", karine, { competencia: "2026-07", diaAdiantamento: 20 }),
    ).toBe(false);
    expect(
      elegivelDocumento("adiantamento", karine, { competencia: "2026-07", diaAdiantamento: 1 }),
    ).toBe(true);
  });
});

describe("cobertura do lote no mês do desligamento", () => {
  const args = {
    colaboradores: [karine],
    vinculados: new Set<string>(),
    unidadeIds: ["u1"],
  };

  it("contracheque de julho não espera a pessoa desligada no mês", () => {
    const r = computeCoverage({ ...args, competencia: "2026-07", tipo: "contracheque" });
    expect(r.esperados).toHaveLength(0);
  });

  it("TRCT é documento pontual: não cobra o lote da unidade", () => {
    const r = computeCoverage({ ...args, competencia: "2026-07", tipo: "trct" });
    expect(r.tipoColetivo).toBe(false);
    expect(r.esperados).toHaveLength(0);
    expect(r.faltantes).toHaveLength(0);
  });

  it("TRCT de junho não espera ninguém", () => {
    const r = computeCoverage({ ...args, competencia: "2026-06", tipo: "trct" });
    expect(r.esperados).toHaveLength(0);
  });

});
