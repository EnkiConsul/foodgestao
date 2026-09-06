import { describe, expect, it } from "vitest";
import {
  diasDireitoPorFaltas,
  exigeRevisaoAdministrativa,
  nivelVencimento,
  textoErroFerias,
  textoPrazo,
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
