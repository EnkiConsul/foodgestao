import { describe, expect, it } from "vitest";
import {
  copiarHorarioEntreDias, definirHorarioNoDia, diaDivergeDoBase, diasPadrao, horarioEfetivoDia,
} from "@/lib/dp/config-trabalho";
import {
  alertaIsonomia, alertasBeneficioAlimentacao, calcularBeneficioMes, descreverDiasJornada,
  diasTrabalhaveisNoMes, termoDispensaTexto,
} from "@/lib/dp/beneficios-regras";
import { premioAssiduidadeBase, valeAlimentacaoDoMes } from "@/lib/dp/remuneracao";

const base = { entrada: "08:00", saida: "17:00", intervalo_minutos: 60 };

describe("horário por dia", () => {
  it("usa o horário base quando o dia não tem horário próprio", () => {
    const dias = diasPadrao();
    expect(horarioEfetivoDia(dias[0], base)).toEqual(base);
    expect(diaDivergeDoBase(dias[0], base)).toBe(false);
  });

  it("grava horário próprio e sinaliza a divergência", () => {
    const dias = definirHorarioNoDia(diasPadrao(), 3, { entrada: "10:00", saida: "19:00", intervalo_minutos: 60 });
    const quarta = dias.find((d) => d.dow === 3)!;
    expect(horarioEfetivoDia(quarta, base).entrada).toBe("10:00");
    expect(diaDivergeDoBase(quarta, base)).toBe(true);
  });

  it("repete o horário de um dia nos dias escolhidos, inclusive em folgas", () => {
    let dias = definirHorarioNoDia(diasPadrao(), 3, { entrada: "10:00", saida: "19:00", intervalo_minutos: 30 });
    dias = dias.map((d) => (d.dow === 5 ? { ...d, trabalha: false } : d));
    dias = copiarHorarioEntreDias(dias, 3, [4, 5], base);
    for (const dow of [4, 5]) {
      const d = dias.find((x) => x.dow === dow)!;
      expect(d.trabalha).toBe(true);
      expect(d.entrada).toBe("10:00");
      expect(d.intervalo_minutos).toBe(30);
    }
  });
});

describe("benefícios", () => {
  it("calcula valor diário no mês com desconto percentual", () => {
    const c = calcularBeneficioMes({
      valor: 25, periodicidade: "diario", dias_base: 22, desconto_tipo: "percentual", desconto_valor: 10,
    });
    expect(c.bruto).toBe(550);
    expect(c.desconto).toBe(55);
    expect(c.liquido).toBe(495);
    expect(c.percentualEfetivo).toBe(10);
  });

  it("limita o desconto fixo ao valor concedido", () => {
    const c = calcularBeneficioMes({ valor: 100, desconto_tipo: "valor", desconto_valor: 500 });
    expect(c.desconto).toBe(100);
    expect(c.liquido).toBe(0);
  });

  it("avisa sobre risco salarial quando não há coparticipação", () => {
    const a = alertasBeneficioAlimentacao({ valor: 600, desconto_tipo: "nenhum" });
    expect(a.some((x) => x.codigo === "va_sem_desconto")).toBe(true);
  });

  it("não avisa quando há desconto dentro da praxe", () => {
    const a = alertasBeneficioAlimentacao({ valor: 600, desconto_tipo: "percentual", desconto_valor: 1 });
    expect(a.some((x) => x.codigo === "va_sem_desconto")).toBe(false);
    expect(a.some((x) => x.codigo === "va_indenizatorio")).toBe(true);
  });

  it("alerta isonomia só com colegas equivalentes que mantêm o benefício", () => {
    const colegas = [
      { colaborador_id: "1", nome: "Ana", cargo_id: "c1", unidade_id: "u1", ativo: true },
      { colaborador_id: "2", nome: "Bruno", cargo_id: "c2", unidade_id: "u1", ativo: true },
      { colaborador_id: "3", nome: "Caio", cargo_id: "c1", unidade_id: "u1", ativo: false },
    ];
    const alerta = alertaIsonomia("vale-alimentação", colegas, { cargo_id: "c1", unidade_id: "u1" });
    expect(alerta?.colegas).toEqual(["Ana"]);
    expect(alertaIsonomia("vale", colegas, { cargo_id: "c9", unidade_id: "u1" })).toBeNull();
  });

  it("gera o termo de dispensa com o nome do benefício", () => {
    const t = termoDispensaTexto({ empresa: "Loja X", colaborador: "Ana", beneficio: "vale-alimentação" });
    expect(t[0]).toContain("Ana");
    expect(t[0]).toContain("vale-alimentação");
  });
});

describe("remuneração", () => {
  it("prêmio percentual incide sobre o salário", () => {
    expect(premioAssiduidadeBase({ premio_assiduidade_tipo: "percentual", premio_assiduidade_valor: 5 }, 2000))
      .toBe(100);
    expect(premioAssiduidadeBase({ premio_assiduidade_tipo: "valor", premio_assiduidade_valor: 150 }, 2000))
      .toBe(150);
  });

  it("vale-alimentação desativado não gera valor", () => {
    expect(valeAlimentacaoDoMes({ vale_alimentacao: false, vale_alimentacao_valor: 500 }).bruto).toBe(0);
  });

  it("vale-alimentação diário usa os dias da jornada e, havendo ponto, os dias apurados", () => {
    const cfg = {
      vale_alimentacao: true,
      vale_alimentacao_valor: 25,
      vale_alimentacao_periodicidade: "diario" as const,
      vale_alimentacao_dias_base: 22,
      vale_alimentacao_dias_origem: "jornada" as const,
      vale_alimentacao_desconto_tipo: "nenhum" as const,
    };
    const jornada = valeAlimentacaoDoMes(cfg, { diasJornada: 26 });
    expect(jornada.dias).toBe(26);
    expect(jornada.bruto).toBe(650);
    expect(jornada.diasOrigem).toBe("jornada");

    const ponto = valeAlimentacaoDoMes(cfg, { diasJornada: 26, diasApurados: 24 });
    expect(ponto.dias).toBe(24);
    expect(ponto.diasOrigem).toBe("ponto");

    const fixo = valeAlimentacaoDoMes(
      { ...cfg, vale_alimentacao_dias_origem: "fixo" },
      { diasJornada: 26 },
    );
    expect(fixo.dias).toBe(22);
    expect(fixo.diasOrigem).toBe("fixo");
  });
});

describe("dias trabalháveis no mês", () => {
  it("conta as ocorrências dos dias marcados na jornada", () => {
    const seisPorUm = [0, 1, 2, 3, 4, 5, 6].map((dow) => ({ dow, trabalha: dow !== 0 }));
    // Agosto/2026: 31 dias, 5 domingos → 26 dias trabalháveis.
    expect(diasTrabalhaveisNoMes(seisPorUm, "2026-08")).toBe(26);

    const cincoPorDois = [0, 1, 2, 3, 4, 5, 6].map((dow) => ({ dow, trabalha: dow >= 1 && dow <= 5 }));
    // Setembro/2026: 30 dias, 22 dias úteis (seg–sex).
    expect(diasTrabalhaveisNoMes(cincoPorDois, "2026-09")).toBe(22);
  });

  it("retorna nulo quando a jornada não foi cadastrada", () => {
    expect(diasTrabalhaveisNoMes([], "2026-08")).toBeNull();
    expect(diasTrabalhaveisNoMes(null, "2026-08")).toBeNull();
  });

  it("descreve a jornada de forma legível", () => {
    const seisPorUm = [0, 1, 2, 3, 4, 5, 6].map((dow) => ({ dow, trabalha: dow !== 0 }));
    expect(descreverDiasJornada(seisPorUm)).toContain("folga dom");
    expect(descreverDiasJornada([])).toBe("jornada não cadastrada");
});

describe("simulação em mês comercial", () => {
  const seisPorUm = [0, 1, 2, 3, 4, 5, 6].map((dow) => ({ dow, trabalha: dow !== 0 }));
  const cincoPorDois = [0, 1, 2, 3, 4, 5, 6].map((dow) => ({ dow, trabalha: dow >= 1 && dow <= 5 }));
  const todosOsDias = [0, 1, 2, 3, 4, 5, 6].map((dow) => ({ dow, trabalha: true }));

  it("desconta folgas semanais × 4 e a folga de fim de semana", () => {
    expect(diasSimuladosMesComercial({ dias: seisPorUm, folgasFimDeSemanaMes: 1 })).toBe(25);
    expect(diasSimuladosMesComercial({ dias: cincoPorDois, folgasFimDeSemanaMes: 1 })).toBe(21);
    expect(diasSimuladosMesComercial({ dias: seisPorUm, folgasFimDeSemanaMes: 0 })).toBe(26);
    expect(diasSimuladosMesComercial({ dias: todosOsDias, folgasFimDeSemanaMes: 0 })).toBe(30);
  });

  it("retorna nulo sem jornada cadastrada", () => {
    expect(diasSimuladosMesComercial({ dias: [], folgasFimDeSemanaMes: 1 })).toBeNull();
    expect(diasSimuladosMesComercial({ dias: null })).toBeNull();
  });

  it("descreve a conta da simulação", () => {
    expect(descreverBaseSimulacao({ dias: seisPorUm, folgasFimDeSemanaMes: 1 }))
      .toBe("30 dias − 1 folga semanal × 4 − 1 folga de fim de semana");
    expect(descreverBaseSimulacao({ dias: todosOsDias, folgasFimDeSemanaMes: 0 })).toBe("30 dias");
    expect(descreverBaseSimulacao({ dias: [] })).toBe("jornada não cadastrada");
  });
});


