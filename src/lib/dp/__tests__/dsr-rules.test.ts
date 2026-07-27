import { describe, it, expect } from "vitest";
import {
  padraoLegalDomingo,
  isMenosProtetiva,
  alertasDeCiencia,
  domingosEsperados,
  avaliarConformidade,
  PADRAO_LEGAL_DOMINGO_MULHER,
  frequenciaParaSemanas,
  semanasDaConfig,
  SEMANAS_POR_MES,
  diasElegiveisDaConfig,
  resumoEscolhaFolgas,
  tetoFolgasMes,
} from "../dsr-rules";

describe("padraoLegalDomingo", () => {
  it("usa 3 semanas para comércio/food service", () => {
    expect(padraoLegalDomingo(true)).toBe(3);
  });
  it("usa 7 semanas para os demais setores", () => {
    expect(padraoLegalDomingo(false)).toBe(7);
  });
});

describe("isMenosProtetiva", () => {
  it("é menos protetiva quando o intervalo é maior que o padrão", () => {
    expect(isMenosProtetiva(4, 3)).toBe(true);
  });
  it("não alerta quando igual ao padrão", () => {
    expect(isMenosProtetiva(3, 3)).toBe(false);
  });
  it("não alerta quando mais protetiva", () => {
    expect(isMenosProtetiva(2, 3)).toBe(false);
  });
  it("trata 0 (nunca exigir domingo) como menos protetiva", () => {
    expect(isMenosProtetiva(0, 3)).toBe(true);
  });
});

describe("alertasDeCiencia", () => {
  const base = { setor_comercio: true, periodicidade_domingo: 3, periodicidade_domingo_mulher: 2 };

  it("não gera alerta na configuração padrão", () => {
    expect(alertasDeCiencia(base, { temMulheres: true })).toHaveLength(0);
  });

  it("gera alerta ao afrouxar a periodicidade geral", () => {
    const r = alertasDeCiencia({ ...base, periodicidade_domingo: 4 }, { temMulheres: false });
    expect(r).toHaveLength(1);
    expect(r[0].campo).toBe("periodicidade_domingo");
    expect(r[0].mensagem).toContain("4 semana(s)");
    expect(r[0].mensagem).toContain("3 semana(s)");
  });

  it("gera alerta da regra feminina apenas quando há mulheres", () => {
    const cfg = { ...base, periodicidade_domingo_mulher: 4 };
    expect(alertasDeCiencia(cfg, { temMulheres: false })).toHaveLength(0);
    expect(alertasDeCiencia(cfg, { temMulheres: true })).toHaveLength(1);
  });

  it("não gera alerta ao tornar a regra mais protetiva", () => {
    const r = alertasDeCiencia({ ...base, periodicidade_domingo: 2 }, { temMulheres: true });
    expect(r).toHaveLength(0);
  });

  it("usa o padrão de 7 semanas para setor não comercial", () => {
    const cfg = { setor_comercio: false, periodicidade_domingo: 5, periodicidade_domingo_mulher: 2 };
    expect(alertasDeCiencia(cfg, { temMulheres: false })).toHaveLength(0);
    expect(
      alertasDeCiencia({ ...cfg, periodicidade_domingo: 8 }, { temMulheres: false }),
    ).toHaveLength(1);
  });
});

describe("domingosEsperados", () => {
  it("calcula pela divisão inteira", () => {
    expect(domingosEsperados(9, 3)).toBe(3);
    expect(domingosEsperados(4, 3)).toBe(1);
  });
  it("retorna 0 quando não há exigência", () => {
    expect(domingosEsperados(9, 0)).toBe(0);
  });
});

describe("avaliarConformidade", () => {
  const cfg = { periodicidade_domingo: 3, periodicidade_domingo_mulher: PADRAO_LEGAL_DOMINGO_MULHER };

  it("aplica a regra quinzenal para mulheres", () => {
    const [linha] = avaliarConformidade(
      [{ colaboradorId: "1", nome: "Ana", sexo: "F", domingosFolgados: ["2026-07-05"], domingosNoPeriodo: 4 }],
      cfg,
    );
    expect(linha.periodicidadeAplicada).toBe(2);
    expect(linha.esperado).toBe(2);
    expect(linha.conforme).toBe(false);
  });

  it("aplica a regra geral para os demais", () => {
    const [linha] = avaliarConformidade(
      [{ colaboradorId: "2", nome: "Bruno", sexo: "M", domingosFolgados: ["2026-07-05"], domingosNoPeriodo: 4 }],
      cfg,
    );
    expect(linha.periodicidadeAplicada).toBe(3);
    expect(linha.esperado).toBe(1);
    expect(linha.conforme).toBe(true);
  });
});

describe("frequenciaParaSemanas", () => {
  it("mantém o valor no modo semanas", () => {
    expect(frequenciaParaSemanas("semanas", 3, 99)).toBe(3);
  });
  it("converte quantidade mensal em intervalo de semanas", () => {
    expect(frequenciaParaSemanas("por_mes", 99, 1)).toBeCloseTo(SEMANAS_POR_MES, 3);
    expect(frequenciaParaSemanas("por_mes", 99, 2)).toBeCloseTo(SEMANAS_POR_MES / 2, 3);
    expect(frequenciaParaSemanas("por_mes", 99, 0.5)).toBeCloseTo(SEMANAS_POR_MES * 2, 3);
  });
  it("retorna 0 quando não há exigência", () => {
    expect(frequenciaParaSemanas("semanas", 0, 1)).toBe(0);
    expect(frequenciaParaSemanas("por_mes", 3, 0)).toBe(0);
  });
});

describe("semanasDaConfig + alertas no modo por_mes", () => {
  it("normaliza os dois modelos para semanas", () => {
    const r = semanasDaConfig({
      setor_comercio: true,
      periodicidade_domingo: 3,
      periodicidade_domingo_mulher: 2,
      modo_frequencia_domingo: "por_mes",
      domingos_por_mes: 1,
      modo_frequencia_domingo_mulher: "semanas",
      domingos_por_mes_mulher: 2,
    });
    expect(r.geral).toBeCloseTo(SEMANAS_POR_MES, 3);
    expect(r.mulher).toBe(2);
  });

  it("alerta quando 1 domingo por mês fica abaixo do padrão de 3 semanas", () => {
    const alertas = alertasDeCiencia(
      {
        setor_comercio: true,
        periodicidade_domingo: 3,
        periodicidade_domingo_mulher: 2,
        modo_frequencia_domingo: "por_mes",
        domingos_por_mes: 1,
      },
      { temMulheres: false },
    );
    expect(alertas).toHaveLength(1);
    expect(alertas[0].campo).toBe("periodicidade_domingo");
  });
});

describe("avaliarConformidade — dias negociados", () => {
  it("aproveita dias negociados apenas no modo acordo coletivo", () => {
    const linha = {
      colaboradorId: "1",
      nome: "Ana",
      sexo: "M",
      domingosFolgados: ["2026-07-05"],
      diasNegociadosFolgados: ["2026-07-08", "2026-07-15"],
      domingosNoPeriodo: 8,
    };
    const cfgLegal = { periodicidade_domingo: 3, periodicidade_domingo_mulher: 2 } as const;
    const [semAcordo] = avaliarConformidade([linha], cfgLegal);
    expect(semAcordo.negociadosAproveitados).toBe(0);
    expect(semAcordo.conforme).toBe(false);

    const [comAcordo] = avaliarConformidade([linha], {
      ...cfgLegal,
      tipo_descanso_domingo: "acordo_coletivo",
    });
    expect(comAcordo.negociadosAproveitados).toBe(1);
    expect(comAcordo.conforme).toBe(true);
  });
});

describe("diasElegiveisDaConfig + tetoFolgasMes", () => {
  it("usa sábado e domingo no modo legislação", () => {
    expect(diasElegiveisDaConfig({ tipo_descanso_domingo: "legal", dias_descanso_negociados: [3] })).toEqual([0, 6]);
  });
  it("usa os dias negociados no modo acordo", () => {
    expect(
      diasElegiveisDaConfig({ tipo_descanso_domingo: "acordo_coletivo", dias_descanso_negociados: [3, 0] }),
    ).toEqual([0, 3]);
  });
  it("limita o teto mensal pela frequência configurada", () => {
    expect(
      tetoFolgasMes({
        modo_frequencia_domingo: "semanas",
        periodicidade_domingo: 3,
        domingos_por_mes: 1,
        folgas_fds_por_mes: 4,
      }),
    ).toBe(2);
  });
});

describe("resumoEscolhaFolgas", () => {
  it("dias marcados são opções, quantidade vem do teto mensal", () => {
    const r = resumoEscolhaFolgas({
      tipo_descanso_domingo: "acordo_coletivo",
      dias_descanso_negociados: [1, 3, 0],
      modo_frequencia_domingo: "semanas",
      periodicidade_domingo: 3,
      domingos_por_mes: 1,
      folgas_fds_por_mes: 1,
    });
    expect(r.dias).toEqual([0, 1, 3]);
    expect(r.teto).toBe(1);
    expect(r.texto).toContain("Seg, Qua, Dom");
    expect(r.texto).toContain("até 1 folga");
  });
});
