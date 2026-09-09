import { describe, expect, it } from "vitest";
import { ativoNaCompetencia } from "../bulk-coverage";

// Quem sai no meio do mês continua devendo o documento daquela competência:
// a pendência não pode desaparecer só porque o cadastro ficou inativo.
describe("ativoNaCompetencia com desligados", () => {
  const karine = {
    id: "k",
    nome: "KARINE COSTA DA SILVA",
    ativo: false,
    data_admissao: "2026-05-07",
    data_desligamento: "2026-07-02",
  };

  it("desligado no dia 2 ainda conta na competência do desligamento", () => {
    expect(ativoNaCompetencia(karine, "2026-07")).toBe(true);
  });

  it("conta nos meses em que trabalhou o mês inteiro", () => {
    expect(ativoNaCompetencia(karine, "2026-06")).toBe(true);
  });

  it("não conta em competência posterior ao desligamento", () => {
    expect(ativoNaCompetencia(karine, "2026-08")).toBe(false);
  });

  it("não conta em competência anterior à admissão", () => {
    expect(ativoNaCompetencia(karine, "2026-04")).toBe(false);
  });

  it("sem datas cadastradas, respeita o flag ativo", () => {
    expect(
      ativoNaCompetencia({ id: "x", nome: "X", ativo: false }, "2026-07"),
    ).toBe(false);
  });
});
