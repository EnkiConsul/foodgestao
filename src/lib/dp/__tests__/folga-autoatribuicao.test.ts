import { describe, expect, it } from "vitest";
import {
  diasValidosDoItem,
  diasValidosDoMes,
  itensAplicaveis,
  parsePlanoAutoatribuicao,
  parsePreviaAutoatribuicao,
  parseResultadoAutoatribuicao,
  resumoPlano,
  resumoPrevia,
  resumoResultado,
} from "../folga-autoatribuicao";


describe("parsePreviaAutoatribuicao", () => {
  it("normaliza o retorno do banco", () => {
    const p = parsePreviaAutoatribuicao({
      competencia: "2026-09-01",
      elegiveis: 10,
      sem_folga: 9,
      a_criar: 9,
      folgas_exigidas: 1,
    });
    expect(p).toEqual({
      competencia: "2026-09-01",
      elegiveis: 10,
      semFolga: 9,
      aCriar: 9,
      folgasExigidas: 1,
    });
  });

  it("tolera retorno vazio", () => {
    expect(parsePreviaAutoatribuicao(null)).toEqual({
      competencia: null,
      elegiveis: 0,
      semFolga: 0,
      aCriar: 0,
      folgasExigidas: 0,
    });
  });
});

describe("parseResultadoAutoatribuicao", () => {
  it("conta quem ficou sem dia disponível", () => {
    const r = parseResultadoAutoatribuicao({
      geradas: 7,
      excedidas: 2,
      detalhes: [
        { motivo: "SEM_DIA_DISPONIVEL" },
        { motivo: "SEM_DIA_SEM_CONFLITO" },
        { motivo: "SEM_VAGA_NO_MES" },
      ],
    });
    expect(r).toEqual({ geradas: 7, excedidas: 2, semDia: 2, ignoradas: 0 });
  });
});

describe("resumos", () => {
  it("avisa quando não há nada a criar", () => {
    expect(
      resumoPrevia({ competencia: null, elegiveis: 3, semFolga: 0, aCriar: 0, folgasExigidas: 1 }),
    ).toContain("Nada será criado");
  });

  it("descreve a prévia no singular", () => {
    expect(
      resumoPrevia({ competencia: null, elegiveis: 3, semFolga: 1, aCriar: 1, folgasExigidas: 1 }),
    ).toBe("1 pessoa está sem folga neste mês. Serão criadas até 1 folga.");
  });

  it("descreve o resultado com excedentes", () => {
    expect(resumoResultado({ geradas: 5, excedidas: 1, semDia: 2, ignoradas: 0 })).toBe(
      "5 folga(s) definida(s) pelo sistema — 1 em dias acima do limite (revise no calendário) — 2 pessoa(s) sem dia disponível.",
    );
  });

  it("descreve resultado vazio", () => {
    expect(resumoResultado({ geradas: 0, excedidas: 0, semDia: 0, ignoradas: 0 })).toBe(
      "Nenhuma folga nova foi criada.",
    );
  });
});

describe("plano de autoatribuição", () => {
  const raw = {
    competencia: "2026-09-01",
    dias: [0, 6],
    folgas_exigidas: 1,
    elegiveis: 7,
    itens: [
      { colaborador_id: "c1", colaborador_nome: "SARA", data_sugerida: "2026-09-06", excede_limite: false, motivo: null, dias: [0, 6], ocupacao: { "2026-09-06": 1 } },
      { colaborador_id: "c2", colaborador_nome: "HANNA", data_sugerida: null, excede_limite: false, motivo: "SEM_DIA_DISPONIVEL" },
      { sem_id: true },
    ],
  };

  it("normaliza o plano ignorando itens sem colaborador", () => {
    const plano = parsePlanoAutoatribuicao(raw);
    expect(plano.itens).toHaveLength(2);
    expect(plano.itens[0]).toEqual({
      colaboradorId: "c1", nome: "SARA", data: "2026-09-06", excedeLimite: false, motivo: null,
      dias: [0, 6], ocupacao: { "2026-09-06": 1 },
    });
    expect(plano.itens[1]).toEqual({
      colaboradorId: "c2", nome: "HANNA", data: null, excedeLimite: false,
      motivo: "SEM_DIA_DISPONIVEL", dias: [], ocupacao: {},
    });
    expect(plano.dias).toEqual([0, 6]);
  });

  it("conta só quem tem dia disponível", () => {
    expect(itensAplicaveis(parsePlanoAutoatribuicao(raw).itens)).toHaveLength(1);
  });

  it("avisa quando não há ninguém sem folga", () => {
    expect(resumoPlano(parsePlanoAutoatribuicao({ ...raw, itens: [] }))).toContain(
      "já atendem à regra da unidade",
    );
  });

  it("orienta a escolha manual quando alguém está acima do limite", () => {
    const plano = parsePlanoAutoatribuicao({
      ...raw,
      itens: [
        { colaborador_id: "c3", colaborador_nome: "CRISTIANE", data_sugerida: null, excede_limite: false, motivo: "ACIMA_DO_LIMITE", dias: [0] },
      ],
    });
    expect(resumoPlano(plano)).toContain("escolha o dia manualmente");
  });

  it("lista apenas sábados e domingos do mês", () => {
    const dias = diasValidosDoMes("2026-09-01", [0, 6]);
    expect(dias[0]).toBe("2026-09-05");
    expect(dias).toContain("2026-09-27");
    expect(dias).not.toContain("2026-09-07");
    expect(dias).toHaveLength(8);
  });

  it("lista os dias válidos de cada pessoa do plano", () => {
    const plano = parsePlanoAutoatribuicao(raw);
    const diasSara = diasValidosDoItem(plano.competencia, plano.itens[0]);
    expect(diasSara).toHaveLength(8);
    expect(diasValidosDoItem(plano.competencia, plano.itens[1])).toHaveLength(0);
  });
});
