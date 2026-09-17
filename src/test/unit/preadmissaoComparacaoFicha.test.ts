import { describe, expect, it } from "vitest";
import {
  dadosParaCadastro,
  divergenciasFicha,
  divergenciasSemEscolha,
} from "@/lib/dp/preadmissao/comparacaoFicha";

const staging = {
  nome: "MARIA DA SILVA",
  cpf: "529.982.247-25",
  data_nascimento: "1998-03-14",
  nome_mae: "ANA DA SILVA",
  pis: "12345678901",
  endereco: "RUA DAS FLORES",
  numero: "10",
  cidade: "GOIANIA",
  uf: "GO",
};

const ficha = {
  nome: "Maria da Silva",
  cpf: "52998224725",
  data_nascimento: "1998-03-14",
  nome_mae: "ANA MARIA DA SILVA",
  pis_nit: "12345678901",
  cargo_nome: "AUXILIAR DE COZINHA",
  endereco: { logradouro: "RUA DAS FLORES", numero: "12", cidade: "GOIANIA", uf: "GO" },
};

describe("comparação da ficha oficial com o staging conferido", () => {
  it("ignora diferença de caixa, acento e pontuação", () => {
    const d = divergenciasFicha(staging, ficha).map((x) => x.campo);
    expect(d).not.toContain("nome");
    expect(d).not.toContain("cpf");
    expect(d).not.toContain("pis");
  });

  it("aponta apenas as diferenças reais", () => {
    const d = divergenciasFicha(staging, ficha).map((x) => x.campo).sort();
    expect(d).toEqual(["nome_mae", "numero"]);
  });

  it("mantém o valor conferido quando não há escolha", () => {
    const out = dadosParaCadastro(staging, ficha, {});
    expect(out.nome_mae).toBe("ANA DA SILVA");
    expect((out.endereco as Record<string, unknown>).numero).toBe("10");
    expect(out.cargo_nome).toBe("AUXILIAR DE COZINHA");
  });

  it("usa o valor da ficha só no campo escolhido", () => {
    const out = dadosParaCadastro(staging, ficha, { nome_mae: "ficha" });
    expect(out.nome_mae).toBe("ANA MARIA DA SILVA");
    expect((out.endereco as Record<string, unknown>).numero).toBe("10");
  });

  it("somente anexar não altera nenhum campo conferido", () => {
    const out = dadosParaCadastro(staging, ficha, { nome_mae: "ficha", numero: "ficha" }, true);
    expect(out.nome_mae).toBe("ANA DA SILVA");
    expect((out.endereco as Record<string, unknown>).numero).toBe("10");
    expect(out.nome).toBe("MARIA DA SILVA");
  });

  it("preenche com o conferido o campo que a ficha não trouxe", () => {
    const out = dadosParaCadastro(staging, { nome: "Maria da Silva" }, {});
    expect(out.nome_mae).toBe("ANA DA SILVA");
    expect((out.endereco as Record<string, unknown>).logradouro).toBe("RUA DAS FLORES");
  });

  it("lista as divergências ainda sem decisão", () => {
    const d = divergenciasFicha(staging, ficha);
    expect(divergenciasSemEscolha(d, { nome_mae: "conferido" }).map((x) => x.campo)).toEqual(["numero"]);
    expect(divergenciasSemEscolha(d, { nome_mae: "conferido", numero: "ficha" })).toEqual([]);
  });
});
