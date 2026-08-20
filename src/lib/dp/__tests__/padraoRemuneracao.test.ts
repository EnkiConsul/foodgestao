import { describe, expect, it } from "vitest";
import {
  gruposAlteracao,
  gruposDivergentesClassificados,
  quemPerdeBeneficio,
  idsAlvoPadrao,
  padraoParaColunasColaborador,
  divergenciasColaboradorVsPadrao,
} from "@/lib/dp/beneficiosPadrao";
import { compararRiscoCargo, textoRisco } from "@/lib/dp/cargos";

const padraoEmpresa = {
  vale_alimentacao: true,
  vale_alimentacao_valor: "24",
  premio_assiduidade: true,
  premio_assiduidade_valor: "11",
} as any;

describe("padrão de remuneração: classificação de divergências", () => {
  it("trata benefício desligado como desligamento, não como novo padrão", () => {
    const atual = { ...padraoEmpresa, vale_alimentacao: false, vale_alimentacao_valor: "" };
    const classificados = gruposDivergentesClassificados(atual, padraoEmpresa);
    expect(classificados).toEqual([{ grupo: "vale_alimentacao", tipo: "desligamento" }]);
    expect(gruposAlteracao(atual, padraoEmpresa)).toEqual([]);
  });

  it("mudança de valor com benefício ligado é alteração", () => {
    const atual = { ...padraoEmpresa, vale_alimentacao_valor: "30" };
    expect(gruposAlteracao(atual, padraoEmpresa)).toEqual(["vale_alimentacao"]);
  });

  it("conta quem perderia o benefício no alcance", () => {
    const time = [{ vale_alimentacao: true }, { vale_alimentacao: false }, { vale_alimentacao: true }];
    expect(quemPerdeBeneficio(time, "vale_alimentacao")).toBe(2);
    expect(quemPerdeBeneficio(time, "beneficios")).toBe(0);
  });
});

describe("adicionais de risco: ficha x cargo", () => {
  it("percentuais iguais não geram pergunta", () => {
    expect(
      compararRiscoCargo(
        { insalubridade: 0, periculosidade: 30 },
        { insalubridade: 0, periculosidade: 30 },
      ),
    ).toEqual({ tipo: "igual" });
  });

  it("ficha com risco acima do cargo é aumento", () => {
    const r = compararRiscoCargo(
      { insalubridade: 0, periculosidade: 30 },
      { insalubridade: 0, periculosidade: 0 },
    );
    expect(r.tipo).toBe("aumento");
  });

  it("ficha zerando risco do cargo é redução", () => {
    const r = compararRiscoCargo(
      { insalubridade: 0, periculosidade: 0 },
      { insalubridade: 0, periculosidade: 30 },
    );
    expect(r.tipo).toBe("reducao");
  });

  it("descreve os percentuais para o diálogo", () => {
    expect(textoRisco({ insalubridade: 20, periculosidade: 30 })).toBe(
      "Insalubridade 20% • Periculosidade 30%",
    );
    expect(textoRisco({ insalubridade: 0, periculosidade: 0 })).toBe("Sem adicional de risco");
  });
});

describe("idsAlvoPadrao", () => {
  const escopo = ["a", "b", "c"];
  it("não aplica a ninguém no alcance novos", () => {
    expect(idsAlvoPadrao(escopo, "novos", ["a"], null)).toEqual([]);
  });
  it("aplica a todos do escopo menos o colaborador aberto", () => {
    expect(idsAlvoPadrao(escopo, "todos", null, "b")).toEqual(["a", "c"]);
  });
  it("limita à seleção manual dentro do escopo", () => {
    expect(idsAlvoPadrao(escopo, "selecionados", ["a", "c", "z"], "c")).toEqual(["a"]);
  });
});

describe("padraoParaColunasColaborador: ciclo dos vales", () => {
  const padraoVales = {
    vale_alimentacao: true,
    vale_alimentacao_valor: "24",
    vale_alimentacao_dia_pagamento: "25",
    vale_alimentacao_dias_corte: "5",
    vale_alimentacao_desconta_falta: true,
    vale_alimentacao_desconta_atestado: true,
    vale_transporte: true,
    vale_transporte_valor_dia: "9",
    vale_transporte_dia_pagamento: "20",
    vale_transporte_desconta_atestado: true,
  } as any;

  it("replica dia de pagamento, corte e descontos", () => {
    const cols = padraoParaColunasColaborador(padraoVales);
    expect(cols.vale_alimentacao_dia_pagamento).toBe(25);
    expect(cols.vale_alimentacao_dias_corte).toBe(5);
    expect(cols.vale_alimentacao_desconta_atestado).toBe(true);
    expect(cols.vale_alimentacao_desconta_ferias).toBe(false);
    expect(cols.vale_transporte_dia_pagamento).toBe(20);
    expect(cols.vale_transporte_desconta_atestado).toBe(true);
  });

  it("zera o ciclo quando o vale está desligado", () => {
    const cols = padraoParaColunasColaborador({
      ...padraoVales,
      vale_alimentacao: false,
    } as any);
    expect(cols.vale_alimentacao_dia_pagamento).toBeNull();
    expect(cols.vale_alimentacao_desconta_atestado).toBeNull();
  });

  it("detecta divergência quando só o desconta atestado difere", () => {
    const colaborador = {
      ...padraoParaColunasColaborador(padraoVales),
      vale_alimentacao_desconta_atestado: false,
    };
    const difs = divergenciasColaboradorVsPadrao(colaborador, padraoVales, [
      "vale_alimentacao",
    ]);
    expect(difs.map((d) => d.coluna)).toContain("vale_alimentacao_desconta_atestado");
  });
});
