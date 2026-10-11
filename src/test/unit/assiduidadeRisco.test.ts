import { describe, expect, it } from "vitest";

import {
  ESTADO_ASSIDUIDADE_LABEL,
  apurarAtrasosMes,
  avaliarRiscoAssiduidade,
  exigeJustificativaAssiduidade,
  padraoAssiduidade,
  premioAssiduidadeAplicavel,
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

  it("com prêmio, falta, atestado e atraso vão para decisão do gestor", () => {
    expect(avaliarRiscoAssiduidade(REGRA, "falta").risco).toBe(true);
    expect(avaliarRiscoAssiduidade(REGRA, "atestado").risco).toBe(true);
    expect(avaliarRiscoAssiduidade(REGRA, "saida_antecipada").risco).toBe(true);
    // Atraso isolado depende da apuração mensal.
    expect(avaliarRiscoAssiduidade(REGRA, "atraso", 3).risco).toBe(false);
  });

  it("soma entrada e retorno do intervalo e só conta o dia acima da tolerância", () => {
    const dias = apurarAtrasosMes(REGRA, [
      { data_operacional: "2026-10-01", tipo: "atraso", minutos: 6 },
      { data_operacional: "2026-10-01", tipo: "atraso_intervalo", minutos: 6 },
      { data_operacional: "2026-10-02", tipo: "atraso", minutos: 10 },
    ]);
    expect(dias[0]).toMatchObject({ totalMin: 12, acimaTolerancia: true, risco: false });
    expect(dias[1]).toMatchObject({ totalMin: 10, acimaTolerancia: false, risco: false });
  });

  it("vai ao gestor só a partir do atraso que estoura o máximo do mês", () => {
    const dias = apurarAtrasosMes(REGRA, [
      { data_operacional: "2026-10-01", tipo: "atraso", minutos: 15 },
      { data_operacional: "2026-10-05", tipo: "atraso", minutos: 20 },
      { data_operacional: "2026-10-06", tipo: "atraso", minutos: 5, estado: "cancelada" },
    ]);
    expect(dias.map((d) => d.risco)).toEqual([false, true]);
  });

  it("sócio nunca tem pergunta de assiduidade", () => {
    expect(premioAssiduidadeAplicavel({ ...REGRA, vinculo_label: "socio" })).toBe(false);
  });

  it("padrão do sistema por evento", () => {
    expect(padraoAssiduidade("falta")).toBe(true);
    expect(padraoAssiduidade("atestado")).toBe(true);
    expect(padraoAssiduidade("licenca")).toBe(true);
    expect(padraoAssiduidade("liberacao")).toBe(false);
    expect(padraoAssiduidade("folga")).toBeNull();
    expect(padraoAssiduidade("ferias")).toBeNull();
    expect(padraoAssiduidade("troca_folga")).toBeNull();
    expect(padraoAssiduidade("indisponibilidade")).toBeNull();
    expect(padraoAssiduidade("socio")).toBeNull();
  });

  it("mudar o padrão exige justificativa", () => {
    expect(exigeJustificativaAssiduidade("atestado", false)).toBe(true);
    expect(exigeJustificativaAssiduidade("atestado", true)).toBe(false);
    expect(exigeJustificativaAssiduidade("liberacao", true)).toBe(true);
    expect(exigeJustificativaAssiduidade("liberacao", false)).toBe(false);
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
      { tipo: "falta", assiduidade_risco: true, assiduidade_decidido_em: "2026-09-22", impacta_assiduidade: "sim" as const },
      { tipo: "falta", assiduidade_risco: true, assiduidade_decidido_em: "2026-09-22", impacta_assiduidade: "nao" as const },
      { tipo: "atraso", assiduidade_risco: true, assiduidade_decidido_em: null, impacta_assiduidade: "aguardando" as const },
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
      { tipo: "falta", assiduidade_risco: true, assiduidade_decidido_em: "2026-09-22", impacta_assiduidade: "nao" as const },
    ];
    const mes = ocorrenciasMesParaPremio(lista, 22);
    expect(premioAssiduidadeDevido(REGRA, mes)).toBe(100);
  });

  it("traduz o erro do servidor para linguagem de negócio", () => {
    expect(textoErroAssiduidade("ASSIDUIDADE_MOTIVO_OBRIGATORIO")).toContain("informe o motivo");
    expect(textoErroAssiduidade(null)).toBe("Não foi possível concluir.");
  });
});
