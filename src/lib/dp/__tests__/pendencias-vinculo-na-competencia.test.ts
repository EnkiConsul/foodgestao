import { describe, expect, it } from "vitest";
import {
  elegivelDocumento,
  limitesVinculoNaCompetencia,
  type VinculoHistorico,
} from "../pendencias-documentos";

// Cristiane: CLT de 01/04/2017 a 27/08/2026 e novo vínculo (freelancer) em
// 28/08/2026 no mesmo cadastro. A ficha passa a mostrar a admissão nova.
const historico: VinculoHistorico[] = [
  {
    colaborador_id: "c1",
    vigencia_inicio: "2017-04-01",
    vigencia_fim: "2026-08-27",
    regime: "clt",
    unidade_id: "u1",
    modo_continuidade: "continuidade",
  },
  {
    colaborador_id: "c1",
    vigencia_inicio: "2026-08-28",
    vigencia_fim: null,
    regime: "freelancer",
    unidade_id: "u1",
    modo_continuidade: "novo_contrato",
  },
];

const fichaAtual = {
  id: "c1",
  nome: "CRISTIANE",
  regime: "freelancer",
  vinculo_label: "CLT",
  optante_adiantamento: true,
  data_admissao: "2026-08-28",
  data_desligamento: null as string | null,
};

describe("limitesVinculoNaCompetencia", () => {
  it("usa o vínculo que cobria a competência", () => {
    expect(limitesVinculoNaCompetencia(historico, "c1", "2026-08")).toEqual({
      admissao: "2017-04-01",
      desligamento: "2026-08-27",
      regime: "clt",
    });
  });

  it("competência posterior cai no vínculo novo", () => {
    expect(limitesVinculoNaCompetencia(historico, "c1", "2026-09")).toEqual({
      admissao: "2026-08-28",
      desligamento: null,
      regime: "freelancer",
    });
  });

  it("sem histórico da pessoa, retorna nulo", () => {
    expect(limitesVinculoNaCompetencia(historico, "outro", "2026-08")).toBeNull();
    expect(limitesVinculoNaCompetencia([], "c1", "2026-08")).toBeNull();
  });
});

describe("adiantamento com vínculo da competência", () => {
  const opts = { competencia: "2026-08", diaAdiantamento: 15, optanteNaCompetencia: true };

  it("sem o vínculo, a admissão nova nega o adiantamento de agosto", () => {
    expect(elegivelDocumento("adiantamento", fichaAtual, opts)).toBe(false);
  });

  it("com o vínculo da competência, o recibo de agosto é esperado", () => {
    expect(
      elegivelDocumento("adiantamento", fichaAtual, {
        ...opts,
        vinculoNaCompetencia: limitesVinculoNaCompetencia(historico, "c1", "2026-08"),
      }),
    ).toBe(true);
  });

  it("vínculo encerrado antes do dia do pagamento não gera adiantamento", () => {
    expect(
      elegivelDocumento("adiantamento", fichaAtual, {
        ...opts,
        vinculoNaCompetencia: { admissao: "2017-04-01", desligamento: "2026-08-10", regime: "clt" },
      }),
    ).toBe(false);
  });

  it("rescisão do vínculo encerrado vale pelo regime daquele vínculo", () => {
    expect(
      elegivelDocumento("rescisao", fichaAtual, {
        competencia: "2026-08",
        vinculoNaCompetencia: limitesVinculoNaCompetencia(historico, "c1", "2026-08"),
      }),
    ).toBe(true);
  });
});
