import { describe, expect, it } from "vitest";
import {
  resolverLimiteFolga,
  resumoRegraLimite,
  type RegraLimiteFolga,
} from "@/lib/dp/folga-limites";

const base: RegraLimiteFolga = {
  id: "r1",
  unidade_id: null,
  dia_semana: null,
  maximo: 3,
  vigencia_inicio: null,
  vigencia_fim: null,
  ativo: true,
  cargo_ids: [],
};

describe("resolverLimiteFolga", () => {
  it("devolve sem limite quando não há regra nem exceção", () => {
    const r = resolverLimiteFolga({ data: "2026-09-12", regras: [] });
    expect(r).toEqual({ limite: null, origem: "sem_limite" });
  });

  it("usa a regra da empresa quando não há nada mais específico", () => {
    const r = resolverLimiteFolga({ data: "2026-09-12", regras: [base] });
    expect(r.limite).toBe(3);
    expect(r.origem).toBe("regra_recorrente");
  });

  it("prefere unidade + cargo + dia da semana à regra geral", () => {
    const especifica: RegraLimiteFolga = {
      ...base,
      id: "r2",
      unidade_id: "u1",
      dia_semana: 6, // sábado
      cargo_ids: ["c1"],
      maximo: 1,
    };
    const r = resolverLimiteFolga({
      data: "2026-09-12", // sábado
      unidadeId: "u1",
      cargoId: "c1",
      regras: [base, especifica],
    });
    expect(r.limite).toBe(1);
    expect(r.regra?.id).toBe("r2");
  });

  it("ignora regra de outra unidade, de outro cargo e de outro dia", () => {
    const outras: RegraLimiteFolga[] = [
      { ...base, id: "a", unidade_id: "u2", maximo: 9 },
      { ...base, id: "b", cargo_ids: ["c9"], maximo: 8 },
      { ...base, id: "c", dia_semana: 1, maximo: 7 },
    ];
    const r = resolverLimiteFolga({
      data: "2026-09-12",
      unidadeId: "u1",
      cargoId: "c1",
      regras: outras,
    });
    expect(r.origem).toBe("sem_limite");
  });

  it("respeita a vigência da regra", () => {
    const regras: RegraLimiteFolga[] = [
      { ...base, id: "antiga", vigencia_fim: "2026-08-31", maximo: 5 },
      { ...base, id: "nova", vigencia_inicio: "2026-09-01", maximo: 2 },
    ];
    expect(resolverLimiteFolga({ data: "2026-08-15", regras }).limite).toBe(5);
    expect(resolverLimiteFolga({ data: "2026-09-15", regras }).limite).toBe(2);
  });

  it("ignora regra desativada", () => {
    const r = resolverLimiteFolga({ data: "2026-09-12", regras: [{ ...base, ativo: false }] });
    expect(r.origem).toBe("sem_limite");
  });

  it("exceção da data vence a regra recorrente, e a da unidade vence a geral", () => {
    const r = resolverLimiteFolga({
      data: "2026-09-12",
      unidadeId: "u1",
      regras: [base],
      diaConfig: [
        { data: "2026-09-12", unidade_id: null, limite_folgas: 4 },
        { data: "2026-09-12", unidade_id: "u1", limite_folgas: 0 },
      ],
    });
    expect(r.limite).toBe(0);
    expect(r.origem).toBe("excecao_data");
  });
});

describe("resumoRegraLimite", () => {
  it("descreve a regra em linguagem simples", () => {
    expect(
      resumoRegraLimite(
        { ...base, unidade_id: "u1", dia_semana: 6, cargo_ids: ["c1"], maximo: 2 },
        { unidade: "Unidade Centro", cargos: ["Garçom"] },
      ),
    ).toBe("Unidade Centro, sábados, Garçom: no máximo 2 em folga");
  });

  it("descreve a regra geral da empresa", () => {
    expect(resumoRegraLimite(base)).toBe("Toda a empresa, todos os dias, qualquer cargo: no máximo 3 em folga");
  });
});
