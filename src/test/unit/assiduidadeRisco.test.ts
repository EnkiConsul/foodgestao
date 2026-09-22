import { describe, expect, it } from "vitest";

import {
  ESTADO_ASSIDUIDADE_LABEL,
  avaliarRiscoAssiduidade,
  estadoAssiduidade,
  ocorrenciasQuePerdemPremio,
  textoErroAssiduidade,
} from "@/lib/dp/assiduidade-risco";
import { ocorrenciasMesParaPremio, premioAssiduidadeDevido } from "@/lib/dp/remuneracao";

const REGRA = {
  premio_assiduidade: true,
  premio_assiduidade_valor: 100,
  assiduidade_criterio: "sem_faltas_sem_atrasos",
  assiduidade_tolerancia_min: 10,
  assiduidade_max_atrasos: 1,
  assiduidade_considera_atestado: true,
  assiduidade_max_atestados: 1,
};

describe("risco de perder o prêmio de assiduidade", () => {
  it("não avisa quem não tem prêmio cadastrado", () => {
    expect(avaliarRiscoAssiduidade({ premio_assiduidade: false }, "falta").risco).toBe(false);
    expect(avaliarRiscoAssiduidade(null, "falta").risco).toBe(false);
  });

  it("avisa na falta e no atestado quando a regra considera atestado", () => {
    expect(avaliarRiscoAssiduidade(REGRA, "falta").risco).toBe(true);
    expect(avaliarRiscoAssiduidade(REGRA, "atestado").risco).toBe(true);
    expect(
      avaliarRiscoAssiduidade({ ...REGRA, assiduidade_considera_atestado: false }, "atestado").risco,
    ).toBe(false);
  });

  it("atraso dentro da tolerância não avisa e acima avisa com os minutos", () => {
    expect(avaliarRiscoAssiduidade(REGRA, "atraso", 8).risco).toBe(false);
    const acima = avaliarRiscoAssiduidade(REGRA, "atraso", 25);
    expect(acima.risco).toBe(true);
    expect(acima.motivo).toContain("25");
  });

  it("horário ainda não informado avisa por precaução", () => {
    expect(avaliarRiscoAssiduidade(REGRA, "previsao_atraso", null).risco).toBe(true);
  });

  it("critério sem_faltas ignora atraso", () => {
    expect(
      avaliarRiscoAssiduidade({ ...REGRA, assiduidade_criterio: "sem_faltas" }, "atraso", 60).risco,
    ).toBe(false);
  });

  it("estado da ocorrência reflete a decisão do gestor", () => {
    expect(estadoAssiduidade({ assiduidade_risco: false })).toBe("sem_risco");
    expect(estadoAssiduidade({ assiduidade_risco: true })).toBe("aguardando");
    expect(
      estadoAssiduidade({
        assiduidade_risco: true,
        assiduidade_decidido_em: "2026-09-22",
        impacta_assiduidade: "sim",
      }),
    ).toBe("perde");
    expect(
      estadoAssiduidade({
        assiduidade_risco: true,
        assiduidade_decidido_em: "2026-09-22",
        impacta_assiduidade: "nao",
      }),
    ).toBe("mantem");
    expect(ESTADO_ASSIDUIDADE_LABEL.aguardando).toBe("Em análise pelo gestor");
  });

  it("só as decididas como perde entram no cálculo do prêmio", () => {
    const lista = [
      { tipo: "falta", assiduidade_risco: true, assiduidade_decidido_em: "2026-09-22", impacta_assiduidade: "sim" },
      { tipo: "falta", assiduidade_risco: true, assiduidade_decidido_em: "2026-09-22", impacta_assiduidade: "nao" },
      { tipo: "atraso", assiduidade_risco: true, assiduidade_decidido_em: null, impacta_assiduidade: "aguardando" },
    ];
    expect(ocorrenciasQuePerdemPremio(lista)).toHaveLength(1);
    const mes = ocorrenciasMesParaPremio(lista, 22);
    expect(mes.faltas).toBe(1);
    expect(mes.atrasos).toBe(0);
    expect(mes.aguardandoDecisao).toBe(1);
    expect(premioAssiduidadeDevido(REGRA, mes)).toBe(0);
  });

  it("mantém o prêmio quando todas foram abonadas pelo gestor", () => {
    const lista = [
      { tipo: "falta", assiduidade_risco: true, assiduidade_decidido_em: "2026-09-22", impacta_assiduidade: "nao" },
    ];
    const mes = ocorrenciasMesParaPremio(lista, 22);
    expect(premioAssiduidadeDevido(REGRA, mes)).toBe(100);
  });

  it("traduz o erro do servidor para linguagem de negócio", () => {
    expect(textoErroAssiduidade("ASSIDUIDADE_MOTIVO_OBRIGATORIO")).toContain("informe o motivo");
    expect(textoErroAssiduidade(null)).toBe("Não foi possível concluir.");
  });
});
