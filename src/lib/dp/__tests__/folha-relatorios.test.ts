import { describe, expect, it } from "vitest";
import { lerDetalhe } from "../folha";
import {
  resumirFolha,
  resumoAnualParaCsv,
  resumoMensal,
  resumoMensalParaCsv,
  resumoPorColaborador,
  resumoPorTipo,
  type LancamentoRelatorio,
} from "../folha-relatorios";

const lanc = (over: Partial<LancamentoRelatorio> = {}): LancamentoRelatorio => ({
  colaboradorId: "c1",
  nome: "Ana",
  unidadeId: "u1",
  competencia: "2026-01",
  tipo: "contracheque_mensal",
  status: "pago",
  bruto: 3000,
  liquido: 2600,
  detalhe: lerDetalhe({ proventos: { normais: 3000 }, faltas: 0, dsr: 0 }),
  ...over,
});

describe("relatórios da folha (Fase 21)", () => {
  it("consolida bruto, líquido e encargos", () => {
    const r = resumirFolha([lanc(), lanc({ colaboradorId: "c2", nome: "Bruno" })]);
    expect(r.bruto).toBe(6000);
    expect(r.liquido).toBe(5200);
    expect(r.descontos).toBe(800);
    expect(r.inss).toBeGreaterThan(0);
    expect(r.fgts).toBe(480);
    expect(r.colaboradores).toBe(2);
    expect(r.lancamentos).toBe(2);
  });

  it("ignora lançamentos cancelados", () => {
    const r = resumirFolha([lanc(), lanc({ status: "cancelado", colaboradorId: "c9" })]);
    expect(r.lancamentos).toBe(1);
    expect(r.colaboradores).toBe(1);
  });

  it("resumo mensal cobre os 12 meses do ano", () => {
    const m = resumoMensal(2026, [lanc(), lanc({ competencia: "2026-03", bruto: 1000, liquido: 900 })]);
    expect(m).toHaveLength(12);
    expect(m[0].bruto).toBe(3000);
    expect(m[2].bruto).toBe(1000);
    expect(m[5].lancamentos).toBe(0);
  });

  it("agrupa por colaborador em ordem alfabética", () => {
    const r = resumoPorColaborador([
      lanc({ colaboradorId: "c2", nome: "Bruno" }),
      lanc(),
      lanc({ competencia: "2026-02" }),
    ]);
    expect(r.map((x) => x.nome)).toEqual(["Ana", "Bruno"]);
    expect(r[0].bruto).toBe(6000);
    expect(r[0].lancamentos).toBe(2);
  });

  it("agrupa por tipo do maior para o menor", () => {
    const r = resumoPorTipo([lanc(), lanc({ tipo: "ferias", bruto: 500, liquido: 500 })]);
    expect(r.map((x) => x.tipo)).toEqual(["contracheque_mensal", "ferias"]);
    expect(r[1].bruto).toBe(500);
  });

  it("gera CSVs com separador ponto e vírgula e decimal vírgula", () => {
    const mensal = resumoMensal(2026, [lanc()]);
    const csv = resumoMensalParaCsv(2026, mensal);
    expect(csv.split("\n")[1]).toContain('"Competencia";"Colaboradores"');
    expect(csv).toContain('"3000,00"');

    const anual = resumoAnualParaCsv(2026, resumoPorColaborador([lanc()]));
    expect(anual).toContain('"Ana"');
    expect(anual).toContain('"2600,00"');
  });
});
