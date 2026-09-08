import { describe, expect, it } from "vitest";
import {
  liberacoesParaUnidade, pessoasSelecionaveisNaUnidade, type LiberacaoApoio,
} from "@/lib/dp/apoio-unidades";

const lib = (over: Partial<LiberacaoApoio>): LiberacaoApoio => ({
  pessoa_apoio_id: null,
  colaborador_id: null,
  unidade_id: "u2",
  cargo_id: null,
  setor_id: null,
  ativo: true,
  ...over,
});

describe("liberacoesParaUnidade", () => {
  it("indexa liberações ativas da unidade com cargo e setor próprios", () => {
    const idx = liberacoesParaUnidade(
      [lib({ colaborador_id: "c1", cargo_id: "cg2", setor_id: "s2" })],
      "u2",
    );
    expect(idx.colaboradorIds.has("c1")).toBe(true);
    expect(idx.porColaborador.get("c1")).toEqual({ cargo_id: "cg2", setor_id: "s2" });
  });

  it("ignora liberações de outra unidade e as inativas", () => {
    const idx = liberacoesParaUnidade(
      [
        lib({ colaborador_id: "c1", unidade_id: "u3" }),
        lib({ pessoa_apoio_id: "p1", ativo: false }),
      ],
      "u2",
    );
    expect(idx.colaboradorIds.size).toBe(0);
    expect(idx.apoioIds.size).toBe(0);
  });
});

describe("pessoasSelecionaveisNaUnidade", () => {
  const pessoas = [
    { id: "a", unidade_id: "u1" },
    { id: "b", unidade_id: "u2" },
    { id: "c", unidade_id: null },
  ];

  it("pertencer a outra unidade não gera disponibilidade", () => {
    const r = pessoasSelecionaveisNaUnidade(pessoas, "u2", new Set());
    expect(r.map((p) => p.id)).toEqual(["b", "c"]);
  });

  it("inclui quem foi liberado explicitamente para a unidade", () => {
    const r = pessoasSelecionaveisNaUnidade(pessoas, "u2", new Set(["a"]));
    expect(r.map((p) => p.id)).toEqual(["a", "b", "c"]);
  });

  it("mantém a pessoa já registrada no dia, mesmo sem liberação ativa", () => {
    const r = pessoasSelecionaveisNaUnidade(pessoas, "u2", new Set(), "a");
    expect(r.map((p) => p.id)).toContain("a");
  });

  it("sem unidade escolhida, não filtra", () => {
    expect(pessoasSelecionaveisNaUnidade(pessoas, null, new Set())).toHaveLength(3);
  });
});
