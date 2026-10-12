import { describe, it, expect } from "vitest";
import {
  PIX_TIPOS_RECOMENDADOS, erroChavePix, erroPagamento, pagamentoParaBanco,
  pixTipoRecomendado, PAGAMENTO_BLANK, precisaTermoTerceiro,
} from "@/lib/dp/dadosPagamento";

const base = { ...PAGAMENTO_BLANK };

describe("chave Pix", () => {
  it("recomenda CPF e celular", () => {
    expect(PIX_TIPOS_RECOMENDADOS).toEqual(["cpf", "telefone"]);
    expect(pixTipoRecomendado("cpf")).toBe(true);
    expect(pixTipoRecomendado("email")).toBe(false);
  });

  it("recusa CPF inválido e aceita CPF válido", () => {
    expect(erroChavePix("cpf", "111.111.111-11")).toMatch(/CPF/);
    expect(erroChavePix("cpf", "703.833.921-44")).toBeNull();
  });

  it("confere celular, e-mail e chave aleatória", () => {
    expect(erroChavePix("telefone", "99999")).toMatch(/DDD/);
    expect(erroChavePix("telefone", "(62) 99236-5959")).toBeNull();
    expect(erroChavePix("email", "sem-arroba")).toMatch(/e-mail/);
    expect(erroChavePix("email", "pessoa@empresa.com")).toBeNull();
    expect(erroChavePix("aleatoria", "abc")).toMatch(/aleat/);
    expect(erroChavePix("aleatoria", "b1e1f4c2a3d44e5f96071829abcdef01")).toBeNull();
  });
});

describe("titularidade do pagamento", () => {
  it("terceiro exige nome, CPF válido e relação", () => {
    const p = { ...base, pix_tipo: "cpf", pix_chave: "703.833.921-44", titular_proprio: false };
    expect(erroPagamento(p)).toMatch(/nome do titular/);
    expect(erroPagamento({ ...p, titular_nome: "MARIA", titular_cpf: "111.111.111-11" })).toMatch(/CPF do titular/);
    expect(erroPagamento({ ...p, titular_nome: "MARIA", titular_cpf: "703.833.921-44" })).toMatch(/parentesco/);
    expect(erroPagamento({ ...p, titular_nome: "MARIA", titular_cpf: "703.833.921-44", titular_relacao: "MÃE" })).toBeNull();
  });

  it("grava terceiro completo e limpa quando é conta própria", () => {
    const t = pagamentoParaBanco({ ...base, pix_tipo: "cpf", pix_chave: "703.833.921-44", titular_proprio: false,
      titular_nome: "maria", titular_cpf: "703.833.921-44", titular_relacao: "mãe" });
    expect(t).toMatchObject({ titular_proprio: false, titular_nome: "MARIA", titular_cpf: "70383392144", titular_relacao: "MÃE" });
    const p = pagamentoParaBanco({ ...base, titular_nome: "X", titular_cpf: "1" });
    expect(p.titular_nome).toBeNull();
  });

  it("só Pix basta, sem banco/agência/conta", () => {
    expect(erroPagamento({ ...base, pix_tipo: "telefone", pix_chave: "(62) 99236-5959" })).toBeNull();
  });

  it("novo termo só quando o terceiro muda", () => {
    const d = { ...base, titular_proprio: false, titular_cpf: "70383392144", pix_chave: "x" };
    expect(precisaTermoTerceiro({ titular_proprio: true }, d)).toBe(true);
    expect(precisaTermoTerceiro(d, d)).toBe(false);
    expect(precisaTermoTerceiro(d, { ...base })).toBe(false);
  });
});
