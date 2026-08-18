import { describe, expect, it } from "vitest";
import {
  assinaturaPadrao,
  nivelPadrao,
  padroesIguais,
  resolverPadrao,
  type BeneficiosPadraoPayload,
} from "@/lib/dp/beneficiosPadrao";

const base = {
  vale_transporte: true,
  vale_transporte_valor_dia: "12,00",
  vale_alimentacao: true,
  vale_alimentacao_valor: "24",
  beneficios: { plano_saude: true, seguro: false },
} as unknown as BeneficiosPadraoPayload;

describe("padrão de benefícios", () => {
  it("ignora ordem de chaves e formato numérico na comparação", () => {
    const doBanco = {
      beneficios: { seguro: false, plano_saude: true },
      vale_alimentacao_valor: "24,00",
      vale_alimentacao: true,
      vale_transporte_valor_dia: "12",
      vale_transporte: true,
    } as unknown as BeneficiosPadraoPayload;
    expect(padroesIguais(base, doBanco)).toBe(true);
    expect(assinaturaPadrao(base)).toBe(assinaturaPadrao(doBanco));
  });

  it("detecta diferença real", () => {
    const outro = { ...base, vale_alimentacao_valor: "30" } as BeneficiosPadraoPayload;
    expect(padroesIguais(base, outro)).toBe(false);
  });

  it("resolve na precedência cargo → unidade → empresa", () => {
    const linhas = [
      { unidade_id: null, cargo_id: null, payload: {} as BeneficiosPadraoPayload },
      { unidade_id: "u1", cargo_id: null, payload: {} as BeneficiosPadraoPayload },
      { unidade_id: "u1", cargo_id: "c1", payload: {} as BeneficiosPadraoPayload },
    ];
    expect(nivelPadrao(resolverPadrao(linhas, "u1", "c1"))).toBe("cargo");
    expect(nivelPadrao(resolverPadrao(linhas, "u1", "c9"))).toBe("unidade");
    expect(nivelPadrao(resolverPadrao(linhas, "u9", "c1"))).toBe("empresa");
  });
});
