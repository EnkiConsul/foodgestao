import { describe, expect, it } from "vitest";
import {
  elegivelRescisaoDoVinculo,
  vinculosEncerrados,
  type VinculoHistorico,
} from "../pendencias-documentos";
import { desligadoNaCompetencia } from "../bulk-coverage";

const cristiane = {
  id: "c1",
  nome: "CRISTIANE",
  regime: "freelancer",
  vinculo_label: "CLT",
  data_admissao: "2026-08-28",
  data_desligamento: null,
};

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

describe("documentação de desligamento após recontratação", () => {
  it("recontratar como freelancer não anula a cobrança do vínculo CLT anterior", () => {
    const encerrados = vinculosEncerrados(historico, cristiane);
    expect(encerrados).toHaveLength(1);
    expect(encerrados[0].dataFim).toBe("2026-08-27");
    expect(encerrados[0].competencia).toBe("2026-08");
    expect(encerrados[0].regime).toBe("clt");
    expect(encerrados[0].unidadeId).toBe("u1");
  });

  it("mudança de condições no mesmo vínculo não conta como encerramento", () => {
    const promocao: VinculoHistorico[] = [
      {
        colaborador_id: "c1",
        vigencia_inicio: "2024-01-01",
        vigencia_fim: "2025-05-31",
        regime: "clt",
        modo_continuidade: "continuidade",
      },
      {
        colaborador_id: "c1",
        vigencia_inicio: "2025-06-01",
        vigencia_fim: null,
        regime: "clt",
        modo_continuidade: "continuidade",
      },
    ];
    expect(vinculosEncerrados(promocao, { ...cristiane, regime: "clt" })).toEqual([]);
  });

  it("desligamento atual da ficha continua sendo cobrado, sem duplicar", () => {
    const desligada = { ...cristiane, regime: "clt", data_desligamento: "2026-08-27" };
    const encerrados = vinculosEncerrados(historico, desligada);
    expect(encerrados.map((v) => v.dataFim)).toEqual(["2026-08-27"]);
  });

  it("vínculo encerrado de sócio ou de regime não assalariado não gera cobrança", () => {
    expect(elegivelRescisaoDoVinculo({ regime: "clt" })).toBe(true);
    expect(elegivelRescisaoDoVinculo({ regime: "pj" })).toBe(false);
    expect(elegivelRescisaoDoVinculo({ regime: "clt", vinculo_label: "Sócio" })).toBe(false);
    const socia = { ...cristiane, vinculo_label: "SÓCIA" };
    expect(vinculosEncerrados(historico, socia)).toEqual([]);
  });

  it("conferência de documentos reconhece o vínculo encerrado do histórico", () => {
    const c = { id: "c1", nome: "CRISTIANE", data_desligamento: null, vinculos_encerrados: ["2026-08-27"] };
    expect(desligadoNaCompetencia(c, "2026-08")).toBe(true);
    expect(desligadoNaCompetencia(c, "2026-09")).toBe(false);
  });
});
