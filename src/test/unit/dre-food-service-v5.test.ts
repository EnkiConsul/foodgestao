import { describe, it, expect } from "vitest";
import { computeDreGerencial, type DreGerencialNode } from "@/lib/relatorios/dreGerencial";
import { computeDreTotais } from "@/lib/relatorios/dre";

const meta = (code: string) => {
  const root = code.split(".")[0];
  const sign = root === "4" ? 1 : -1;
  return { root_code: root, dre_sign: sign, level: code.split(".").length };
};
const n = (code: string, saldo: number): DreGerencialNode => ({ code, saldo_consolidado: saldo, ...meta(code) });

// Saldos com sinal (entradas +, saídas −), já consolidados por nível.
const NODES: DreGerencialNode[] = [
  n("4", 10500), n("4.1", 12000), n("4.2", 300), n("4.2.1", 100), n("4.3", -1800), n("4.3.1", -1000), n("4.3.2", -800),
  n("5", -5000), n("5.1", -3500), n("5.2", -1500),
  n("6", -3000), n("6.1", -600), n("6.2", -1400), n("6.3", -1000), n("6.3.2", -300), n("6.3.6", -100), n("6.3.7", -400),
  n("7", -200), n("7.1", -200),
  n("8", -900), n("8.1", -600), n("8.2", -300),
];

describe("DRE food service v5", () => {
  const d = computeDreGerencial(NODES);

  it("mantém o mesmo resultado líquido da DRE anterior", () => {
    expect(d.resultadoLiquido).toBeCloseTo(computeDreTotais(NODES).resultado, 2);
    expect(d.resultadoLiquido).toBeCloseTo(1400, 2);
  });

  it("deduções incluem descontos, cancelamentos e tributos sobre faturamento", () => {
    expect(d.deducoes).toBe(2400);
    expect(d.receitaLiquida).toBe(9600);
  });

  it("margem de contribuição desconta CMV, mão de obra direta e despesas variáveis", () => {
    expect(d.margemContribuicao).toBe(9600 - 3500 - 1500 - 600);
  });

  it("pró-labore fica separado do pessoal administrativo", () => {
    expect(d.proLabore).toBe(400);
    expect(d.pessoalAdministrativo).toBe(400);
    expect(d.administracao).toBe(200);
  });

  it("IRPJ/CSLL fica abaixo do resultado antes dos tributos sobre o lucro", () => {
    expect(d.irpjCsll).toBe(300);
    expect(d.resultadoAntesIr - d.irpjCsll).toBe(d.resultadoLiquido);
  });
});
