import { describe, it, expect } from "vitest";
import {
  calcularRemuneracaoConvocacao,
  minutosNoturnos,
  remuneracaoDoSnapshot,
  snapshotDesatualizado,
} from "@/lib/dp/convocacao-remuneracao";

describe("minutosNoturnos", () => {
  it("ignora jornada diurna", () => {
    expect(minutosNoturnos("08:00", "17:00")).toBe(0);
  });

  it("conta as horas após as 22h", () => {
    expect(minutosNoturnos("20:00", "23:00")).toBe(60);
  });

  it("conta a virada da madrugada até as 5h", () => {
    expect(minutosNoturnos("22:00", "04:00", true)).toBe(6 * 60);
  });

  it("limita a janela noturna em 5h", () => {
    expect(minutosNoturnos("23:00", "08:00", true)).toBe(6 * 60);
  });
});

describe("calcularRemuneracaoConvocacao", () => {
  it("abre as verbas proporcionais do intermitente com DSR", () => {
    const r = calcularRemuneracaoConvocacao({
      valorUnitario: 10,
      unidade: "hora",
      quantidade: 8,
      entrada: "08:00",
      saida: "17:00",
    });
    expect(r.valorHoras).toBe(80);
    expect(r.baseDsr).toBe(80);
    expect(r.dsr).toBeCloseTo(13.33, 2);
    expect(r.decimoTerceiro).toBeCloseTo(7.78, 2);
    expect(r.ferias).toBeCloseTo(7.78, 2);
    expect(r.tercoFerias).toBeCloseTo(2.59, 2);
    expect(r.inss).toBeGreaterThan(0);
    expect(r.baseInss).toBeCloseTo(93.33, 2);
    expect(r.fgts).toBeCloseTo(Number((r.baseTributavel * 0.08).toFixed(2)), 2);
    expect(r.liquido).toBeCloseTo(
      Number((r.bruto - r.inss - r.inssDecimoTerceiro).toFixed(2)),
      2,
    );
  });

  it("reflete o adicional noturno na base do DSR", () => {
    const r = calcularRemuneracaoConvocacao({
      valorUnitario: 10,
      unidade: "hora",
      quantidade: 6,
      entrada: "20:00",
      saida: "02:00",
      terminaNoDiaSeguinte: true,
    });
    expect(r.adicionalNoturno).toBeCloseTo(8, 2);
    expect(r.baseDsr).toBeCloseTo(68, 2);
    expect(r.dsr).toBeCloseTo(11.33, 2);
  });

  it("tributa o 13º separadamente e deixa férias fora da base do INSS", () => {
    const r = calcularRemuneracaoConvocacao({
      valorUnitario: 40,
      unidade: "hora",
      quantidade: 8,
    });
    expect(r.baseInss).toBeCloseTo(r.valorHoras + r.dsr, 2);
    expect(r.inssDecimoTerceiro).toBeGreaterThan(0);
    expect(r.descontosLista.some((d) => d.chave === "inss_13")).toBe(true);
  });

  it("soma o prêmio de assiduidade informado no dia", () => {
    const r = calcularRemuneracaoConvocacao({
      valorUnitario: 7.95,
      unidade: "hora",
      quantidade: 7.33,
      premioAssiduidadeDia: 6.99,
      valeAlimentacaoDia: 24,
    });
    expect(r.premioAssiduidade).toBe(6.99);
    expect(r.valeAlimentacao).toBe(24);
    expect(r.proventos.some((p) => p.chave === "premio")).toBe(true);
    expect(r.proventos.some((p) => p.chave === "dsr")).toBe(true);
  });

  it("soma adicional noturno e vale-alimentação", () => {
    const r = calcularRemuneracaoConvocacao({
      valorUnitario: 10,
      unidade: "hora",
      quantidade: 6,
      entrada: "20:00",
      saida: "02:00",
      terminaNoDiaSeguinte: true,
      valeAlimentacaoDia: 22,
      valeAlimentacaoDescontoDia: 2,
    });
    expect(r.horasNoturnas).toBe(4);
    expect(r.adicionalNoturno).toBeCloseTo(8, 2);
    expect(r.valeAlimentacao).toBe(22);
    expect(r.descontos).toBeCloseTo(Number((r.inss + r.inssDecimoTerceiro + 2).toFixed(2)), 2);
  });

  it("freelancer não gera verbas CLT, DSR nem INSS", () => {
    const r = calcularRemuneracaoConvocacao({
      valorUnitario: 150,
      unidade: "diaria",
      quantidade: 1,
      comVerbasProporcionais: false,
    });
    expect(r.dsr).toBe(0);
    expect(r.inssDecimoTerceiro).toBe(0);
    expect(r.decimoTerceiro).toBe(0);
    expect(r.inss).toBe(0);
    expect(r.fgts).toBe(0);
    expect(r.liquido).toBe(150);
  });
});

describe("remuneracaoDoSnapshot", () => {
  it("retorna null sem valores", () => {
    expect(remuneracaoDoSnapshot(null)).toBeNull();
    expect(remuneracaoDoSnapshot({ valor_unitario: 0 })).toBeNull();
  });

  it("usa o horário da oferta para o noturno", () => {
    const r = remuneracaoDoSnapshot(
      { valor_unitario: 12, quantidade_prevista: 5, unidade_remuneracao: "hora", vale_alimentacao_dia: 15 },
      { entrada: "22:00", saida: "03:00", termina_no_dia_seguinte: true },
    );
    expect(r?.horasNoturnas).toBe(5);
    expect(r?.valeAlimentacao).toBe(15);
  });

  it("recalcula pelo cadastro atual quando o resumo é de versão anterior", () => {
    const antigo = {
      valor_unitario: 7.95,
      quantidade_prevista: 7.33,
      unidade_remuneracao: "hora",
      fonte: "cadastro_colaborador",
    };
    const atual = {
      versao: 2,
      elegivel: true,
      valor_unitario: 7.95,
      quantidade_prevista: 7.33,
      unidade_remuneracao: "hora",
      vale_alimentacao_dia: 24,
      premio_assiduidade_dia: 6.99,
      dsr_divisor: 6,
    };
    const semAtual = remuneracaoDoSnapshot(antigo, undefined);
    expect(semAtual?.valeAlimentacao).toBe(0);
    expect(semAtual?.estimada).toBeUndefined();

    const comAtual = remuneracaoDoSnapshot(antigo, undefined, atual);
    expect(comAtual?.estimada).toBe(true);
    expect(comAtual?.valeAlimentacao).toBe(24);
    expect(comAtual?.premioAssiduidade).toBe(6.99);
    expect(comAtual?.dsr).toBeGreaterThan(0);
  });

  it("não substitui resumo já na versão atual", () => {
    const r = remuneracaoDoSnapshot(
      { versao: 2, valor_unitario: 10, quantidade_prevista: 4, unidade_remuneracao: "hora" },
      undefined,
      { versao: 2, elegivel: true, valor_unitario: 99, quantidade_prevista: 4 },
    );
    expect(r?.valorHoras).toBe(40);
    expect(r?.estimada).toBeUndefined();
  });
});

describe("snapshotDesatualizado", () => {
  it("reconhece resumos antigos e atuais", () => {
    expect(snapshotDesatualizado({ valor_unitario: 10 })).toBe(true);
    expect(snapshotDesatualizado({ versao: 2 })).toBe(false);
    expect(snapshotDesatualizado(null)).toBe(false);
  });
});
