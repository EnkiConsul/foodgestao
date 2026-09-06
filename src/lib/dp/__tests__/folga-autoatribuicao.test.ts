import { describe, expect, it } from "vitest";
import {
  parsePreviaAutoatribuicao,
  parseResultadoAutoatribuicao,
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
    expect(r).toEqual({ geradas: 7, excedidas: 2, semDia: 2 });
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
    expect(resumoResultado({ geradas: 5, excedidas: 1, semDia: 2 })).toBe(
      "5 folga(s) definida(s) pelo sistema — 1 em dias acima do limite (revise no calendário) — 2 pessoa(s) sem dia disponível.",
    );
  });

  it("descreve resultado vazio", () => {
    expect(resumoResultado({ geradas: 0, excedidas: 0, semDia: 0 })).toBe(
      "Nenhuma folga nova foi criada.",
    );
  });
});
