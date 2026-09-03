import { describe, expect, it } from "vitest";
import {
  lerDetalhe,
  lerExtras,
  totaisDosExtras,
  valoresDoLancamento,
  encargosDoLancamento,
  folhaParaCsv,
  type LinhaFolha,
} from "../folha";
import { linhasDoHolerite } from "../holerite";

const detalheBase = {
  faltas: 100,
  dsr: 20,
  proventos: { normais: 2000, extras50: 100, extras100: 0, noturno: 0 },
  horas: { normais: 220, extras50: 6, extras100: 0, noturnos: 0, falta: 8, atraso: 0, diasFalta: 1, dsrPerdidos: 1 },
};

describe("rubricas avulsas (Fase 16)", () => {
  it("descarta rubricas sem descrição ou com valor zero/negativo", () => {
    expect(
      lerExtras([
        { descricao: "Adiantamento", natureza: "desconto", valor: 500 },
        { descricao: "", natureza: "provento", valor: 100 },
        { descricao: "Prêmio", natureza: "provento", valor: 0 },
        { descricao: "Erro", natureza: "provento", valor: -50 },
      ]),
    ).toEqual([{ descricao: "Adiantamento", natureza: "desconto", valor: 500, tributavel: true }]);
  });

  it("lerDetalhe devolve extras vazios em detalhes legados", () => {
    expect(lerDetalhe(detalheBase).extras).toEqual([]);
    expect(lerDetalhe(null).extras).toEqual([]);
  });

  it("soma extras por natureza", () => {
    const extras = lerExtras([
      { descricao: "Prêmio", natureza: "provento", valor: 300 },
      { descricao: "Vale", natureza: "desconto", valor: 120.5 },
    ]);
    expect(totaisDosExtras(extras)).toEqual({ proventos: 300, descontos: 120.5 });
  });

  it("recalcula bruto e líquido incluindo as rubricas avulsas", () => {
    const detalhe = lerDetalhe({
      ...detalheBase,
      extras: [
        { descricao: "Prêmio", natureza: "provento", valor: 300 },
        { descricao: "Adiantamento", natureza: "desconto", valor: 500 },
      ],
    });
    // 2400 − 100 faltas − 20 DSR − INSS/IRRF − 500 adiantamento
    const enc = encargosDoLancamento(detalhe);
    expect(valoresDoLancamento(detalhe)).toEqual({
      bruto: 2400,
      liquido: Math.round((1780 - enc.descontos) * 100) / 100,
    });
  });

  it("nunca devolve líquido negativo", () => {
    const detalhe = lerDetalhe({
      ...detalheBase,
      extras: [{ descricao: "Empréstimo", natureza: "desconto", valor: 99999 }],
    });
    expect(valoresDoLancamento(detalhe).liquido).toBe(0);
  });

  it("inclui as rubricas avulsas no holerite", () => {
    const detalhe = lerDetalhe({ ...detalheBase, extras: [{ descricao: "Prêmio", natureza: "provento", valor: 300 }] });
    const linhas = linhasDoHolerite({
      empresa: "Aveto 360",
      colaborador: "Karine",
      competencia: "2026-06-01",
      tipo: "contracheque_mensal",
      detalhe,
      valorBruto: 2400,
      valorLiquido: 2280,
    });
    expect(linhas.some((l) => l.descricao === "Prêmio" && l.provento === 300)).toBe(true);
  });

  it("exporta colunas de outros proventos/descontos no CSV", () => {
    const linha: LinhaFolha = {
      id: "1",
      colaborador_id: "c1",
      nome: "Karine",
      status: "rascunho",
      valor_bruto: 2400,
      valor_liquido: 1780,
      detalhe: lerDetalhe({
        ...detalheBase,
        extras: [
          { descricao: "Prêmio", natureza: "provento", valor: 300 },
          { descricao: "Adiantamento", natureza: "desconto", valor: 500 },
        ],
      }),
    };
    const csv = folhaParaCsv("2026-06", [linha]);
    expect(csv.split("\n")[0]).toContain("Outros proventos");
    expect(csv).toContain("300,00");
    expect(csv).toContain("500,00");
  });
});
