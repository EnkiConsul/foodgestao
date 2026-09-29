import { describe, expect, it } from "vitest";
import { erroAplicacaoFicha } from "@/lib/dp/ficha-registro/erroAplicacao";
import { ehRegraNegada } from "@/lib/dp/regraAviso";

describe("mensagens da aplicação da ficha", () => {
  it("mostra validações conhecidas sem texto técnico", () => {
    const erro = erroAplicacaoFicha("Já existe um colaborador com este CPF nesta empresa.");
    expect(ehRegraNegada(erro)).toBe(true);
    expect(erro.message).toBe("Já existe um colaborador com este CPF nesta empresa.");
  });

  it("traduz falha técnica de permissão", () => {
    const erro = erroAplicacaoFicha("permission denied for table dp_colaboradores");
    expect(ehRegraNegada(erro)).toBe(true);
    expect(erro.message).toContain("inclusão em Colaboradores");
    expect(erro.message).not.toContain("dp_colaboradores");
  });
});