import { describe, it, expect } from "vitest";
import {
  chaveRascunhoAdmissao,
  rascunhoTemConteudo,
  rotuloRascunho,
  rotuloSalvoEm,
} from "../admissao-rascunho";

describe("chaveRascunhoAdmissao", () => {
  it("separa novo cadastro, promoção de folguista e edição", () => {
    expect(chaveRascunhoAdmissao({})).toBe("novo");
    expect(chaveRascunhoAdmissao({ pessoaApoioId: "p1" })).toBe("apoio:p1");
    expect(chaveRascunhoAdmissao({ colaboradorId: "c1", pessoaApoioId: "p1" })).toBe("colaborador:c1");
  });
});

describe("rascunhoTemConteudo", () => {
  it("ignora formulário em branco", () => {
    expect(rascunhoTemConteudo({ form: { nome: "", cpf: "" } })).toBe(false);
    expect(rascunhoTemConteudo(null)).toBe(false);
  });

  it("guarda quando já existe identificação ou lotação", () => {
    expect(rascunhoTemConteudo({ form: { nome: "AN" } })).toBe(true);
    expect(rascunhoTemConteudo({ form: { cpf: "044." } })).toBe(true);
    expect(rascunhoTemConteudo({ form: { unidade_id: "u1" } })).toBe(true);
    expect(rascunhoTemConteudo({ form: { cargo_id: "c1" } })).toBe(true);
  });
});

describe("rótulos", () => {
  it("mostra o horário do último salvamento", () => {
    expect(rotuloSalvoEm(null)).toBe("");
    expect(rotuloSalvoEm("data-ruim")).toBe("");
    expect(rotuloSalvoEm("2026-09-22T20:42:00Z")).toMatch(/^Salvo às \d{2}:\d{2}$/);
  });

  it("mostra data e hora do rascunho para retomar", () => {
    expect(rotuloRascunho(null)).toBe("Rascunho guardado");
    expect(rotuloRascunho("2026-09-22T20:42:00Z")).toMatch(/^Rascunho de \d{2}\/\d{2} às \d{2}:\d{2}$/);
  });
});
