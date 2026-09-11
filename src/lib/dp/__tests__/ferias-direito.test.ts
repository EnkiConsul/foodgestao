import { describe, expect, it } from "vitest";
import {
  alertaPendenciaFerias,
  diasDireitoPorFaltas,
  exigeRevisaoAdministrativa,
  nivelVencimento,
  nivelVencimentoPeriodo,
  riscoAcumulo,
  riscoAcumuloPorColaborador,
  textoErroFerias,
  textoPrazo,
  textoRiscoAcumulo,
} from "../ferias-direito";

describe("faixas legais de faltas", () => {
  it("0 falta mantém o direito padrão", () => {
    expect(diasDireitoPorFaltas(0)).toBe(30);
    expect(diasDireitoPorFaltas(5)).toBe(30);
  });

  it("6 faltas cai para 24 dias", () => {
    expect(diasDireitoPorFaltas(6)).toBe(24);
    expect(diasDireitoPorFaltas(14)).toBe(24);
  });

  it("15 faltas cai para 18 dias", () => {
    expect(diasDireitoPorFaltas(15)).toBe(18);
    expect(diasDireitoPorFaltas(23)).toBe(18);
  });

  it("24 faltas cai para 12 dias", () => {
    expect(diasDireitoPorFaltas(24)).toBe(12);
    expect(diasDireitoPorFaltas(32)).toBe(12);
  });

  it("acima de 32 faltas exige revisão e não inventa direito", () => {
    expect(diasDireitoPorFaltas(33)).toBe(0);
    expect(exigeRevisaoAdministrativa(33)).toBe(true);
    expect(exigeRevisaoAdministrativa(32)).toBe(false);
    expect(exigeRevisaoAdministrativa(null)).toBe(false);
  });

  it("sem informação usa o direito padrão", () => {
    expect(diasDireitoPorFaltas(null)).toBe(30);
    expect(diasDireitoPorFaltas(undefined)).toBe(30);
  });
});

describe("prazo de concessão", () => {
  it("30 dias é atenção prioritária", () => {
    expect(nivelVencimento(30)).toBe("atencao");
    expect(nivelVencimento(1)).toBe("atencao");
    expect(nivelVencimento(0)).toBe("atencao");
  });

  it("90 dias é apenas planejamento", () => {
    expect(nivelVencimento(31)).toBe("planejamento");
    expect(nivelVencimento(90)).toBe("planejamento");
  });

  it("acima de 90 dias é normal e abaixo de zero é vencido", () => {
    expect(nivelVencimento(120)).toBe("normal");
    expect(nivelVencimento(-1)).toBe("vencido");
  });

  it("descreve o prazo em linguagem simples", () => {
    expect(textoPrazo(0)).toBe("O prazo termina hoje");
    expect(textoPrazo(10)).toContain("Faltam 10");
    expect(textoPrazo(-3)).toContain("vencido há 3");
  });
});

describe("mensagens de erro", () => {
  it("traduz o código do banco", () => {
    expect(textoErroFerias("FERIAS_FALTAS_MOTIVO_OBRIGATORIO")).toContain("motivo");
  });

  it("mantém a mensagem quando não conhece o código", () => {
    expect(textoErroFerias("erro estranho")).toBe("erro estranho");
  });
});

describe("nivelVencimentoPeriodo — ciclos já encerrados", () => {
  const base = {
    fimAquisitivo: "2025-09-30",
    limiteConcessivo: "2026-09-30",
    diasSaldo: 30,
    hojeISO: "2026-09-08",
  };

  it("cenário real (Erildson): política padrão marca A conceder", () => {
    expect(nivelVencimentoPeriodo({ ...base, hojeISO: "2026-01-10" })).toBe("a_conceder");
  });

  it("prazo legal apertado continua em Atenção", () => {
    expect(nivelVencimentoPeriodo({ ...base, diasSaldo: 5 })).toBe("atencao");
  });

  it("prazo restante menor que o saldo vira marcação atrasada", () => {
    expect(nivelVencimentoPeriodo(base)).toBe("marcacao_atrasada");
  });

  it("caso do Erildson em 11/09/2026: 19 dias de prazo com 30 de saldo é marcação atrasada", () => {
    expect(nivelVencimentoPeriodo({ ...base, hojeISO: "2026-09-11" })).toBe("marcacao_atrasada");
  });

  it("desligado nunca é cobrado por prazo", () => {
    expect(nivelVencimentoPeriodo({ ...base, desligado: true })).toBe("normal");
    expect(
      nivelVencimentoPeriodo({ ...base, hojeISO: "2027-01-10", desligado: true }),
    ).toBe("normal");
  });

  it("política legal ignora o ciclo encerrado", () => {
    expect(nivelVencimentoPeriodo({ ...base, hojeISO: "2026-01-10", politica: "legal" })).toBe(
      "normal",
    );
  });

  it("política vencido marca vencido assim que o ciclo fecha", () => {
    expect(nivelVencimentoPeriodo({ ...base, hojeISO: "2026-01-10", politica: "vencido" })).toBe(
      "vencido",
    );
  });

  it("sem saldo não sinaliza nada", () => {
    expect(
      nivelVencimentoPeriodo({ ...base, hojeISO: "2026-01-10", diasSaldo: 0 }),
    ).toBe("normal");
  });

  it("ciclo em aquisição não sinaliza", () => {
    expect(
      nivelVencimentoPeriodo({
        fimAquisitivo: "2026-09-30",
        limiteConcessivo: "2027-09-30",
        diasSaldo: 30,
        hojeISO: "2026-09-08",
      }),
    ).toBe("normal");
  });

  it("prazo legal estourado é vencido em qualquer política", () => {
    expect(nivelVencimentoPeriodo({ ...base, hojeISO: "2026-10-05", politica: "legal" })).toBe(
      "vencido",
    );
  });
});

describe("alertaPendenciaFerias", () => {
  const base = {
    fimAquisitivo: "2025-09-30",
    limiteConcessivo: "2026-09-30",
    diasSaldo: 30,
    politica: "a_conceder" as const,
  };

  it("mantém o período adquirido como a conceder longe do prazo", () => {
    expect(alertaPendenciaFerias({ ...base, hojeISO: "2026-01-10" }).titulo).toBe("Férias a conceder");
  });

  it("destaca risco de dobra quando o prazo legal está próximo", () => {
    const alerta = alertaPendenciaFerias({ ...base, diasSaldo: 5, hojeISO: "2026-09-11" });
    expect(alerta.titulo).toBe("Férias a conceder — risco de dobra");
    expect(alerta.detalhePrazo).toContain("19 dia(s)");
  });

  it("destaca que o prazo legal termina hoje", () => {
    const alerta = alertaPendenciaFerias({ ...base, diasSaldo: 0, hojeISO: "2026-09-30" });
    expect(alerta.titulo).toBe("Férias a conceder — risco de dobra");
    expect(alerta.detalhePrazo).toBe("prazo legal termina hoje");
  });

  it("avisa marcação atrasada quando o prazo não cabe o saldo", () => {
    const alerta = alertaPendenciaFerias({ ...base, hojeISO: "2026-09-11" });
    expect(alerta.titulo).toBe("Férias — marcação atrasada");
    expect(alerta.detalhePrazo).toContain("30 dia(s) a gozar");
  });

  it("informa vencimento e pagamento em dobro após o prazo", () => {
    const alerta = alertaPendenciaFerias({ ...base, hojeISO: "2026-10-01" });
    expect(alerta.titulo).toBe("Férias vencidas — pagamento em dobro");
    expect(alerta.detalhePrazo).toContain("1 dia(s)");
  });
});

describe("risco de pagamento em dobro", () => {
  const p = (id: string, ini: string, fim: string, limite: string, saldo: number, extra: any = {}) => ({
    id,
    inicio_aquisitivo: ini,
    fim_aquisitivo: fim,
    limite_concessivo: limite,
    dias_saldo: saldo,
    status: "disponivel",
    ...extra,
  });

  const hojeISO = "2026-09-08";

  it("um período em aberto não gera risco", () => {
    const r = riscoAcumulo({ periodos: [p("a", "2024-10-01", "2025-09-30", "2026-09-30", 30)], hojeISO });
    expect(r.emRisco).toBe(false);
    expect(r.periodosAbertos).toHaveLength(1);
  });

  it("dois períodos com saldo geram risco e apontam o mais antigo", () => {
    const r = riscoAcumulo({
      periodos: [
        p("novo", "2025-10-01", "2026-09-30", "2027-09-30", 30),
        p("antigo", "2024-10-01", "2025-09-30", "2026-09-30", 30),
      ],
      hojeISO,
    });
    expect(r.emRisco).toBe(true);
    expect(r.periodoMaisAntigo?.id).toBe("antigo");
    expect(r.diasParaLimite).toBe(22);
  });

  it("período de controle externo não conta", () => {
    const r = riscoAcumulo({
      periodos: [
        p("hist", "2023-10-01", "2024-09-30", "2025-09-30", 30, { controle_externo: true }),
        p("atual", "2024-10-01", "2025-09-30", "2026-09-30", 30),
      ],
      hojeISO,
    });
    expect(r.emRisco).toBe(false);
  });

  it("período sem saldo ou em aquisição não conta", () => {
    const r = riscoAcumulo({
      periodos: [
        p("zerado", "2024-10-01", "2025-09-30", "2026-09-30", 0),
        p("emcurso", "2025-10-01", "2026-09-30", "2027-09-30", 30, { status: "em_aquisicao" }),
        p("aberto", "2023-10-01", "2024-09-30", "2025-09-30", 12),
      ],
      hojeISO,
    });
    expect(r.emRisco).toBe(false);
    expect(r.periodoMaisAntigo?.id).toBe("aberto");
  });

  it("agrupa o risco por colaborador", () => {
    const mapa = riscoAcumuloPorColaborador(
      [
        { ...p("a1", "2024-10-01", "2025-09-30", "2026-09-30", 30), colaborador_id: "c1" },
        { ...p("a2", "2025-10-01", "2026-09-30", "2027-09-30", 30), colaborador_id: "c1" },
        { ...p("b1", "2024-10-01", "2025-09-30", "2026-09-30", 30), colaborador_id: "c2" },
      ],
      hojeISO,
    );
    expect(mapa.get("c1")?.emRisco).toBe(true);
    expect(mapa.get("c2")?.emRisco).toBe(false);
    expect(textoRiscoAcumulo(mapa.get("c1")!)).toContain("dobro");
    expect(textoRiscoAcumulo(mapa.get("c2")!)).toBeNull();
  });
});

describe("sócio fica fora do controle legal de férias", () => {
  const base = {
    fimAquisitivo: "2025-09-30",
    limiteConcessivo: "2026-09-30",
    diasSaldo: 30,
    hojeISO: "2026-10-05",
  };

  it("nunca é sinalizado por prazo, mesmo com o limite estourado", () => {
    expect(nivelVencimentoPeriodo({ ...base, socio: true })).toBe("normal");
    expect(nivelVencimentoPeriodo(base)).toBe("vencido");
  });

  it("não entra no risco de pagamento em dobro", () => {
    const p = (id: string, ini: string, fim: string, limite: string) => ({
      id,
      inicio_aquisitivo: ini,
      fim_aquisitivo: fim,
      limite_concessivo: limite,
      dias_saldo: 30,
      status: "disponivel",
      socio: true,
    });
    const r = riscoAcumulo({
      periodos: [
        p("a", "2024-10-01", "2025-09-30", "2026-09-30"),
        p("b", "2025-10-01", "2026-09-30", "2027-09-30"),
      ],
      hojeISO: "2026-09-08",
    });
    expect(r.emRisco).toBe(false);
    expect(r.periodosAbertos).toHaveLength(0);
  });
});
