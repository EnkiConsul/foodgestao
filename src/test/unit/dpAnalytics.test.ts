import { describe, expect, it } from "vitest";
import {
  competenciasDoPeriodo,
  diasNaInterseccao,
  diasDoPeriodo,
  periodoAnterior,
  periodoPorMeses,
  textoVariacao,
  variacao,
} from "@/lib/dp/analytics/periodo";
import {
  distribuir,
  headcountEm,
  headcountMedio,
  noQuadroEm,
  permanencia,
  serieMensal,
  turnoverPeriodo,
  type ColaboradorAnalytics,
} from "@/lib/dp/analytics/equipe";
import {
  diasDeAfastamento,
  resumoFolgas,
  resumoOcorrencias,
  resumoSolicitacoes,
} from "@/lib/dp/analytics/ausencias";
import {
  agruparOperacao,
  baselineComAmostras,
  classificarDias,
  ehMaoDeObraExtra,
  resumoExtras,
  resumoSituacao,
} from "@/lib/dp/analytics/operacao";
import { colaboradorNoFiltro, normalizarFiltros, TODOS } from "@/lib/dp/analytics/filtros";
import { montarPontosAtencao } from "@/lib/dp/analytics/insights";

const colab = (over: Partial<ColaboradorAnalytics> = {}): ColaboradorAnalytics => ({
  id: over.id ?? "c1",
  nome: "Pessoa",
  unidade_id: "u1",
  cargo_id: "cg1",
  setor_id: null,
  regime: "clt",
  data_admissao: "2026-01-01",
  data_desligamento: null,
  ...over,
});

describe("período", () => {
  it("conta os dois extremos do intervalo", () => {
    expect(diasDoPeriodo({ inicio: "2026-03-01", fim: "2026-03-31" })).toBe(31);
    expect(diasNaInterseccao({ inicio: "2026-03-30", fim: "2026-04-02" }, { inicio: "2026-03-01", fim: "2026-03-31" })).toBe(2);
  });

  it("período anterior tem a mesma quantidade de dias e não se sobrepõe", () => {
    const p = { inicio: "2026-03-01", fim: "2026-03-31" };
    const ant = periodoAnterior(p);
    expect(diasDoPeriodo(ant)).toBe(diasDoPeriodo(p));
    expect(ant.fim < p.inicio).toBe(true);
  });

  it("lista as competências do período", () => {
    const p = periodoPorMeses(3, new Date("2026-03-15T12:00:00"));
    expect(competenciasDoPeriodo(p)).toEqual(["2026-01", "2026-02", "2026-03"]);
  });

  it("variação em pontos percentuais é descrita sem causa", () => {
    expect(textoVariacao(variacao(12, 8), { pp: true })).toContain("4");
    expect(variacao(8, 8).sentido).toBe("estavel");
  });
});

describe("equipe", () => {
  it("o dia do desligamento ainda conta como quadro", () => {
    const c = colab({ data_desligamento: "2026-03-10" });
    expect(noQuadroEm(c, "2026-03-10")).toBe(true);
    expect(noQuadroEm(c, "2026-03-11")).toBe(false);
  });

  it("headcount médio usa início e fim do período", () => {
    const lista = [colab({ id: "a" }), colab({ id: "b", data_admissao: "2026-03-20" })];
    const p = { inicio: "2026-03-01", fim: "2026-03-31" };
    expect(headcountEm(lista, p.inicio)).toBe(1);
    expect(headcountEm(lista, p.fim)).toBe(2);
    expect(headcountMedio(lista, p)).toBe(1.5);
  });

  it("rotatividade combina entradas e saídas", () => {
    const lista = [
      colab({ id: "a" }),
      colab({ id: "b", data_admissao: "2026-03-05" }),
      colab({ id: "c", data_desligamento: "2026-03-20" }),
    ];
    expect(turnoverPeriodo(lista, { inicio: "2026-03-01", fim: "2026-03-31" })).toBeGreaterThan(0);
  });

  it("série mensal cobre todas as competências", () => {
    const serie = serieMensal([colab()], { inicio: "2026-01-01", fim: "2026-03-31" });
    expect(serie.map((m) => m.competencia)).toEqual(["2026-01", "2026-02", "2026-03"]);
  });

  it("permanência separa quem saiu com até 90 dias", () => {
    const r = permanencia(
      [
        colab({ id: "a", data_admissao: "2026-02-01", data_desligamento: "2026-03-10" }),
        colab({ id: "b", data_admissao: "2024-01-01", data_desligamento: "2026-03-10" }),
        colab({ id: "c", data_admissao: null, data_desligamento: "2026-03-10" }),
      ],
      { inicio: "2026-03-01", fim: "2026-03-31" },
    );
    expect(r.totalDesligados).toBe(3);
    expect(r.considerados).toBe(2);
    expect(r.semDataAdmissao).toBe(1);
    expect(r.ate90Dias).toBe(1);
  });

  it("chaves nulas viram Não informado", () => {
    const d = distribuir([{ k: null }, { k: "x" }], (i) => i.k, (k) => k ?? "Não informado");
    expect(d.find((i) => i.chave === null)?.label).toBe("Não informado");
  });
});

describe("ausências", () => {
  it("dias de atestado só contam a parte dentro do período", () => {
    const dias = diasDeAfastamento(
      [{ colaborador_id: "a", data_alvo: "2026-02-26", data_fim: "2026-03-03" }],
      { inicio: "2026-03-01", fim: "2026-03-31" },
    );
    expect(dias).toBe(3);
  });

  it("folga automática e exceção de janela são contadas separadamente", () => {
    const r = resumoFolgas(
      [
        { colaborador_id: "a", data: "2026-03-02", tipo: "normal", origem: "automatica_clt", status: "confirmada", extra: false },
        { colaborador_id: "b", data: "2026-03-03", tipo: "normal", origem: "solicitacao", status: "confirmada", extra: true },
        { colaborador_id: "c", data: "2026-03-04", tipo: "normal", origem: "solicitacao", status: "cancelada", extra: false },
      ],
      { inicio: "2026-03-01", fim: "2026-03-31" },
    );
    expect(r.efetivas).toBe(2);
    expect(r.automaticas).toBe(1);
    expect(r.excecoesDeJanela).toBe(1);
    expect(r.porSolicitacao).toBe(1);
  });

  it("tempo de resposta usa a data da decisão registrada", () => {
    const r = resumoSolicitacoes(
      [
        {
          colaborador_id: "a",
          tipo: "folga",
          status: "aprovada",
          created_at: "2026-03-02T10:00:00Z",
          respondido_em: "2026-03-03T10:00:00Z",
        },
        { colaborador_id: "b", tipo: "folga", status: "pendente", created_at: "2026-03-05T10:00:00Z", respondido_em: null },
      ],
      { inicio: "2026-03-01", fim: "2026-03-31" },
    );
    expect(r.recebidas).toBe(2);
    expect(r.pendentes).toBe(1);
    expect(r.mediaHorasDecisao).toBe(24);
  });

  it("só ocorrência confirmada conta", () => {
    const r = resumoOcorrencias(
      [
        { colaborador_id: "a", tipo: "atraso", estado: "confirmada", data_operacional: "2026-03-02", unidade_id: "u1", setor_id: null },
        { colaborador_id: "a", tipo: "atraso", estado: "confirmada", data_operacional: "2026-03-05", unidade_id: "u1", setor_id: null },
        { colaborador_id: "b", tipo: "falta", estado: "prevista", data_operacional: "2026-03-06", unidade_id: "u1", setor_id: null },
      ],
      { inicio: "2026-03-01", fim: "2026-03-31" },
    );
    expect(r.confirmadas).toBe(2);
    expect(r.colaboradores).toBe(1);
    expect(r.comDuasOuMais).toBe(1);
  });
});

describe("operação", () => {
  const historico = Array.from({ length: 8 }, (_, i) => ({
    // oito segundas anteriores a 2026-03-02
    data: `2026-0${i < 4 ? 1 : 2}-${String(i < 4 ? 5 + i * 7 : 2 + (i - 4) * 7).padStart(2, "0")}`,
    pessoas: 5,
  }));

  it("dia da semana sem amostras suficientes fica sem padrão", () => {
    const base = baselineComAmostras([{ data: "2026-02-23", pessoas: 4 }], { limite: "2026-03-01" });
    const dias = classificarDias([{ data: "2026-03-02", pessoas: 2 }], base);
    expect(dias[0].situacao).toBe("sem_padrao");
    expect(resumoSituacao(dias).analisados).toBe(0);
  });

  it("classifica abaixo do habitual e agrupa por dia da semana", () => {
    const base = baselineComAmostras(
      [
        { data: "2026-02-02", pessoas: 6 },
        { data: "2026-02-09", pessoas: 6 },
        { data: "2026-02-16", pessoas: 6 },
      ],
      { limite: "2026-03-01" },
    );
    const dias = classificarDias([{ data: "2026-03-02", pessoas: 3 }], base);
    expect(dias[0].situacao).toBe("abaixo");
    const linhas = agruparOperacao(dias, (d) => String(d.dow), () => "Segunda");
    expect(linhas[0].percentualAbaixo).toBe(100);
  });

  it("dias sem ninguém na operação não entram no padrão", () => {
    const base = baselineComAmostras(
      [...historico.slice(0, 3).map((h) => ({ ...h, pessoas: 0 }))],
      { limite: "2026-03-01" },
    );
    expect(base.size).toBe(0);
  });

  it("registro manual de colaborador do quadro não é mão de obra extra", () => {
    expect(ehMaoDeObraExtra({ tipo: "registro_manual", colaborador_id: "c1" })).toBe(false);
    expect(ehMaoDeObraExtra({ tipo: "folguista", colaborador_id: null })).toBe(true);
    const r = resumoExtras(
      [
        { id: "1", tipo: "folguista", colaborador_id: null, unidade_id: "u1", cargo_id: "cg", data_inicio: "2026-03-02", data_fim: "2026-03-03" },
        { id: "2", tipo: "registro_manual", colaborador_id: "c1", unidade_id: "u1", cargo_id: "cg", data_inicio: "2026-03-02", data_fim: "2026-03-02" },
      ],
      { inicio: "2026-03-01", fim: "2026-03-31" },
    );
    expect(r.utilizacoes).toBe(1);
    expect(r.diasComExtra).toBe(2);
  });
});

describe("filtros", () => {
  it("setor de outra unidade é descartado", () => {
    const setores = [{ id: "s1", nome: "Cozinha", unidade_id: "u2", ativo: true }];
    const f = normalizarFiltros({ unidade: "u1", cargo: TODOS, setor: "s1", vinculo: TODOS }, setores);
    expect(f.setor).toBe(TODOS);
  });

  it("filtra pelo cadastro da pessoa", () => {
    const c = colab({ setor_id: "s1", regime: "intermitente" });
    expect(colaboradorNoFiltro(c, { unidade: "u1", cargo: TODOS, setor: "s1", vinculo: "intermitente" })).toBe(true);
    expect(colaboradorNoFiltro(c, { unidade: "u9", cargo: TODOS, setor: TODOS, vinculo: TODOS })).toBe(false);
  });
});

describe("pontos de atenção", () => {
  const base = {
    periodoLabel: "jan/26 — mar/26",
    operacaoPorDow: [],
    diasAbaixo: 0,
    feriasProximasDoPrazo: 0,
    feriasVencidas: 0,
    extrasPorDiaSemana: [0, 0, 0, 0, 0, 0, 0],
    aceiteConvocacoes: null,
    aceiteConvocacoesAnterior: null,
    ocorrenciasConfirmadas: 0,
    ocorrenciasAnteriores: 0,
    diasAfastamento: 0,
    diasAfastamentoAnterior: 0,
    diasFeriasAbaixo: 0,
  };

  it("sem desvio, não inventa alerta", () => {
    expect(montarPontosAtencao(base)).toEqual([]);
  });

  it("descreve o fato sem afirmar causa", () => {
    const pontos = montarPontosAtencao({ ...base, feriasVencidas: 2, aceiteConvocacoes: 50, aceiteConvocacoesAnterior: 80 });
    const textos = pontos.map((p) => p.texto).join(" ");
    expect(pontos.length).toBe(2);
    expect(textos).not.toMatch(/porque|por causa|devido/i);
  });
});
