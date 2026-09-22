import { describe, it, expect } from "vitest";
import {
  PIX_TIPOS_RECOMENDADOS, erroChavePix, erroPagamento, pagamentoParaBanco,
  pixTipoRecomendado, PAGAMENTO_BLANK,
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
  it("recusa conta de outra pessoa", () => {
    const erro = erroPagamento({
      ...base, pix_tipo: "cpf", pix_chave: "703.833.921-44", titular_proprio: false,
    });
    expect(erro).toMatch(/titularidade do próprio colaborador/);
  });

  it("nunca grava titular de terceiro no banco", () => {
    const linha = pagamentoParaBanco({
      ...base,
      pix_tipo: "cpf",
      pix_chave: "703.833.921-44",
      titular_proprio: false,
      titular_nome: "OUTRA PESSOA",
      titular_cpf: "703.833.921-44",
    });
    expect(linha.titular_proprio).toBe(true);
    expect(linha.titular_nome).toBeNull();
    expect(linha.titular_cpf).toBeNull();
  });

  it("aceita chave Pix própria e válida", () => {
    expect(erroPagamento({ ...base, pix_tipo: "telefone", pix_chave: "(62) 99236-5959" })).toBeNull();
  });
});
