import { describe, it, expect } from "vitest";
import {
  padraoLegalDomingo,
  isMenosProtetiva,
  alertasDeCiencia,
  domingosEsperados,
  avaliarConformidade,
  PADRAO_LEGAL_DOMINGO_MULHER,
} from "../dsr-rules";

describe("padraoLegalDomingo", () => {
  it("usa 3 semanas para comércio/food service", () => {
    expect(padraoLegalDomingo(true)).toBe(3);
  });
  it("usa 7 semanas para os demais setores", () => {
    expect(padraoLegalDomingo(false)).toBe(7);
  });
});

describe("isMenosProtetiva", () => {
  it("é menos protetiva quando o intervalo é maior que o padrão", () => {
    expect(isMenosProtetiva(4, 3)).toBe(true);
  });
  it("não alerta quando igual ao padrão", () => {
    expect(isMenosProtetiva(3, 3)).toBe(false);
  });
  it("não alerta quando mais protetiva", () => {
    expect(isMenosProtetiva(2, 3)).toBe(false);
  });
  it("trata 0 (nunca exigir domingo) como menos protetiva", () => {
    expect(isMenosProtetiva(0, 3)).toBe(true);
  });
});

describe("alertasDeCiencia", () => {
  const base = { setor_comercio: true, periodicidade_domingo: 3, periodicidade_domingo_mulher: 2 };

  it("não gera alerta na configuração padrão", () => {
    expect(alertasDeCiencia(base, { temMulheres: true })).toHaveLength(0);
  });

  it("gera alerta ao afrouxar a periodicidade geral", () => {
    const r = alertasDeCiencia({ ...base, periodicidade_domingo: 4 }, { temMulheres: false });
    expect(r).toHaveLength(1);
    expect(r[0].campo).toBe("periodicidade_domingo");
    expect(r[0].mensagem).toContain("4 semana(s)");
    expect(r[0].mensagem).toContain("3 semana(s)");
  });

  it("gera alerta da regra feminina apenas quando há mulheres", () => {
    const cfg = { ...base, periodicidade_domingo_mulher: 4 };
    expect(alertasDeCiencia(cfg, { temMulheres: false })).toHaveLength(0);
    expect(alertasDeCiencia(cfg, { temMulheres: true })).toHaveLength(1);
  });

  it("não gera alerta ao tornar a regra mais protetiva", () => {
    const r = alertasDeCiencia({ ...base, periodicidade_domingo: 2 }, { temMulheres: true });
    expect(r).toHaveLength(0);
  });

  it("usa o padrão de 7 semanas para setor não comercial", () => {
    const cfg = { setor_comercio: false, periodicidade_domingo: 5, periodicidade_domingo_mulher: 2 };
    expect(alertasDeCiencia(cfg, { temMulheres: false })).toHaveLength(0);
    expect(
      alertasDeCiencia({ ...cfg, periodicidade_domingo: 8 }, { temMulheres: false }),
    ).toHaveLength(1);
  });
});

describe("domingosEsperados", () => {
  it("calcula pela divisão inteira", () => {
    expect(domingosEsperados(9, 3)).toBe(3);
    expect(domingosEsperados(4, 3)).toBe(1);
  });
  it("retorna 0 quando não há exigência", () => {
    expect(domingosEsperados(9, 0)).toBe(0);
  });
});

describe("avaliarConformidade", () => {
  const cfg = { periodicidade_domingo: 3, periodicidade_domingo_mulher: PADRAO_LEGAL_DOMINGO_MULHER };

  it("aplica a regra quinzenal para mulheres", () => {
    const [linha] = avaliarConformidade(
      [{ colaboradorId: "1", nome: "Ana", sexo: "F", domingosFolgados: ["2026-07-05"], domingosNoPeriodo: 4 }],
      cfg,
    );
    expect(linha.periodicidadeAplicada).toBe(2);
    expect(linha.esperado).toBe(2);
    expect(linha.conforme).toBe(false);
  });

  it("aplica a regra geral para os demais", () => {
    const [linha] = avaliarConformidade(
      [{ colaboradorId: "2", nome: "Bruno", sexo: "M", domingosFolgados: ["2026-07-05"], domingosNoPeriodo: 4 }],
      cfg,
    );
    expect(linha.periodicidadeAplicada).toBe(3);
    expect(linha.esperado).toBe(1);
    expect(linha.conforme).toBe(true);
  });
});
