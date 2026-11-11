import { describe, expect, it } from "vitest";
import { alternarGrupo, montarContatosLote, separarGruposCargo } from "../organizacao-lote";

describe("etapa de cargos: pendências primeiro", () => {
  it("fichas sem cargo vêm antes dos cargos sem setor, e os já identificados ficam por último", () => {
    const grupos = [
      { chave: "cozinheiro", generico: false, setor: "Cozinha" },
      { chave: "motorista", generico: false, setor: null },
      { chave: "item:1", generico: true, setor: null },
      { chave: "garcom", generico: false, setor: "Salão" },
    ];
    const r = separarGruposCargo(grupos, (g) => g.setor === null);
    expect(r.atencao.map((g) => g.chave)).toEqual(["item:1", "motorista"]);
    expect(r.identificados.map((g) => g.chave)).toEqual(["cozinheiro", "garcom"]);
  });
});

describe("padrões do lote para pessoas escolhidas", () => {
  it("atalho de setor marca só as pessoas daquele setor, sem desmarcar as outras", () => {
    const r = alternarGrupo(new Set(["a"]), ["b", "c"]);
    expect([...r].sort()).toEqual(["a", "b", "c"]);
  });

  it("tocar de novo no setor todo marcado desmarca só aquele setor", () => {
    const r = alternarGrupo(new Set(["a", "b", "c"]), ["b", "c"]);
    expect([...r]).toEqual(["a"]);
  });
});

describe("lista rápida de dados para acesso", () => {
  const base = (id: string) => ({
    anterior: id === "x" ? { endereco: "Rua 1" } : {},
    lidos: id === "y" ? { telefone: "6433330000" } : {},
  });

  it("salva só as linhas preenchidas e mantém o que já estava no rascunho", () => {
    const r = montarContatosLote(
      { x: { whatsapp: "(64) 99999-0000", email: "" }, z: { whatsapp: "", email: "" } },
      base,
    );
    expect(Object.keys(r.itens)).toEqual(["x"]);
    expect(r.itens.x.dados).toEqual({ endereco: "Rua 1", whatsapp: "64999990000", telefone: "64999990000" });
  });

  it("não troca o telefone que veio do PDF", () => {
    const r = montarContatosLote({ y: { whatsapp: "64988887777", email: "" } }, base);
    expect(r.itens.y.dados).toEqual({ whatsapp: "64988887777" });
  });

  it("número sem DDD não é salvo e volta como inválido", () => {
    const r = montarContatosLote({ x: { whatsapp: "99999-000", email: "" } }, base);
    expect(r.itens).toEqual({});
    expect(r.invalidos).toEqual(["x"]);
  });

  it("e-mail sozinho é aceito e gravado em minúsculas", () => {
    const r = montarContatosLote({ z: { whatsapp: "", email: " Ana@Rancho.com " } }, base);
    expect(r.itens.z.dados).toEqual({ email: "ana@rancho.com" });
  });
});
