import { describe, expect, it } from "vitest";
import {
  FILTROS_BENEFICIOS_PADRAO,
  contarFiltrosBeneficios,
  pessoaAtendeFiltros,
  pessoaAtendeSituacao,
} from "@/lib/dp/beneficios-filtros";

const pessoa = {
  id: "c1",
  nome: "TAMIRES SÓCIA",
  unidade_id: "u1",
  cargo_id: "g1",
  ativo: true,
  data_desligamento: null as string | null,
};

describe("filtros da tela de Benefícios", () => {
  it("passa tudo no padrão", () => {
    expect(pessoaAtendeFiltros(pessoa, FILTROS_BENEFICIOS_PADRAO)).toBe(true);
  });

  it("filtra por unidade e cargo combinados", () => {
    const f = { ...FILTROS_BENEFICIOS_PADRAO, unidade: "u1", cargo: "g1" };
    expect(pessoaAtendeFiltros(pessoa, f)).toBe(true);
    expect(pessoaAtendeFiltros({ ...pessoa, cargo_id: "g2" }, f)).toBe(false);
    expect(pessoaAtendeFiltros({ ...pessoa, unidade_id: "u2" }, f)).toBe(false);
  });

  it("busca sem acento e sem caixa", () => {
    const f = { ...FILTROS_BENEFICIOS_PADRAO, busca: "socia" };
    expect(pessoaAtendeFiltros(pessoa, f)).toBe(true);
    expect(pessoaAtendeFiltros({ ...pessoa, nome: "HANNA" }, f)).toBe(false);
  });

  it("filtra por colaborador escolhido", () => {
    const f = { ...FILTROS_BENEFICIOS_PADRAO, colaborador: "c1" };
    expect(pessoaAtendeFiltros(pessoa, f)).toBe(true);
    expect(pessoaAtendeFiltros({ ...pessoa, id: "c2" }, f)).toBe(false);
  });

  it("não exclui ninguém por tipo de vínculo", () => {
    const socio = { ...pessoa, id: "socio" };
    expect(pessoaAtendeFiltros(socio, FILTROS_BENEFICIOS_PADRAO)).toBe(true);
  });

  it("situação ativos mantém desligado dentro da janela do ciclo", () => {
    const desligado = { ...pessoa, data_desligamento: "2026-09-10" };
    expect(pessoaAtendeSituacao(desligado, "ativos", { janelaInicio: "2026-09-01" })).toBe(true);
    expect(pessoaAtendeSituacao(desligado, "ativos", { janelaInicio: "2026-10-01" })).toBe(false);
    expect(pessoaAtendeSituacao({ ...pessoa, ativo: false }, "ativos")).toBe(false);
  });

  it("situação desligados e todos", () => {
    expect(pessoaAtendeSituacao(pessoa, "desligados")).toBe(false);
    expect(pessoaAtendeSituacao({ ...pessoa, ativo: false }, "desligados")).toBe(true);
    expect(pessoaAtendeSituacao({ ...pessoa, ativo: false }, "todos")).toBe(true);
  });

  it("conta só os filtros diferentes do padrão", () => {
    expect(contarFiltrosBeneficios(FILTROS_BENEFICIOS_PADRAO)).toBe(0);
    expect(
      contarFiltrosBeneficios({
        ...FILTROS_BENEFICIOS_PADRAO,
        unidade: "u1",
        situacao: "todos",
      }),
    ).toBe(2);
  });
});
