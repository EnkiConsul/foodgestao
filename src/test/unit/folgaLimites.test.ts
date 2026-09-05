import { describe, expect, it } from "vitest";
import {
  ocupacaoNoEscopo,
  conflitoColaboradores,
  diasPermitidosParaLimite,
  resolverLimiteFolga,
  resumoRegraLimite,
  type RegraLimiteFolga,
} from "@/lib/dp/folga-limites";

const base: RegraLimiteFolga = {
  id: "r1",
  tipo: "quantidade",
  nome: null,
  unidade_id: "u1",
  dia_semana: null,
  maximo: 3,
  vigencia_inicio: null,
  vigencia_fim: null,
  ativo: true,
  cargo_ids: [],
  colaborador_ids: [],
};


describe("resolverLimiteFolga", () => {
  it("devolve sem limite quando não há regra nem exceção", () => {
    const r = resolverLimiteFolga({ data: "2026-09-12", regras: [] });
    expect(r).toEqual({ limite: null, origem: "sem_limite" });
  });

  it("usa a regra da unidade quando não há nada mais específico", () => {
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

  it("descreve a regra geral da unidade", () => {
    expect(resumoRegraLimite(base)).toBe("Unidade, todos os dias, qualquer cargo: no máximo 3 em folga");
  });
});

describe("regras de tipo colaboradores", () => {
  const dupla: RegraLimiteFolga = {
    ...base,
    id: "d1",
    tipo: "colaboradores",
    maximo: 0,
    colaborador_ids: ["hanna", "sara"],
  };

  it("não interfere no limite de quantidade", () => {
    const r = resolverLimiteFolga({ data: "2026-09-12", regras: [dupla] });
    expect(r.origem).toBe("sem_limite");
  });

  it("aponta o colega quando o outro já está de folga no dia", () => {
    const c = conflitoColaboradores({
      data: "2026-09-13",
      colaboradorId: "hanna",
      regras: [dupla],
      emFolgaNaData: ["sara", "joao"],
    });
    expect(c?.colaboradorId).toBe("sara");
  });

  it("libera quando ninguém da regra está de folga", () => {
    expect(
      conflitoColaboradores({
        data: "2026-09-13",
        colaboradorId: "hanna",
        regras: [dupla],
        emFolgaNaData: ["joao"],
      }),
    ).toBeNull();
  });

  it("respeita dia da semana e unidade da regra", () => {
    const soSabadoU1 = { ...dupla, dia_semana: 6, unidade_id: "u1" };
    expect(
      conflitoColaboradores({
        data: "2026-09-13", // domingo
        colaboradorId: "hanna",
        unidadeId: "u1",
        regras: [soSabadoU1],
        emFolgaNaData: ["sara"],
      }),
    ).toBeNull();
    expect(
      conflitoColaboradores({
        data: "2026-09-12", // sábado
        colaboradorId: "hanna",
        unidadeId: "u2",
        regras: [soSabadoU1],
        emFolgaNaData: ["sara"],
      }),
    ).toBeNull();
  });

  it("descreve a regra de pessoas em linguagem simples", () => {
    expect(
      resumoRegraLimite(dupla, { colaboradores: ["Hanna", "Sara"] }),
    ).toBe("Hanna e Sara não folgam no mesmo dia (unidade, todos os dias)");
  });
});

describe("diasPermitidosParaLimite", () => {
  it("ordena, remove repetidos e descarta inválidos", () => {
    expect(diasPermitidosParaLimite([6, 0, 6, 9, -1])).toEqual([0, 6]);
  });
});

describe("regra de quantidade com cargos", () => {
  const regraQuantidadePorCargo: RegraLimiteFolga = {
    ...base,
    tipo: "quantidade",
    cargo_ids: ["cozinheiro", "ajudante"],
    maximo: 1,
  };

  it("combina com pessoa do cargo e ignora quem não é do cargo", () => {
    const data = "2026-09-12"; // sábado
    const doCargo = resolverLimiteFolga({
      data,
      unidadeId: "u1",
      cargoId: "cozinheiro",
      regras: [regraQuantidadePorCargo],
    });
    expect(doCargo.limite).toBe(1);
    expect(doCargo.origem).toBe("regra_recorrente");
    expect(doCargo.regra?.cargo_ids).toEqual(["cozinheiro", "ajudante"]);

    const foraDoCargo = resolverLimiteFolga({
      data,
      unidadeId: "u1",
      cargoId: "garcom",
      regras: [regraQuantidadePorCargo],
    });
    expect(foraDoCargo.origem).toBe("sem_limite");
  });

  it("regra de quantidade sem cargos continua valendo para todos", () => {
    const r = resolverLimiteFolga({
      data: "2026-09-12",
      unidadeId: "u1",
      cargoId: "garcom",
      regras: [base],
    });
    expect(r.limite).toBe(3);
    expect(r.origem).toBe("regra_recorrente");
  });
});

describe("ocupacaoNoEscopo", () => {
  const folgas = [
    { cargoId: "cozinheiro" },
    { cargoId: "garcom" },
    { cargoId: "cozinheiro" },
    { cargoId: null },
  ];

  it("sem escopo de cargos, conta todas as folgas", () => {
    expect(ocupacaoNoEscopo(folgas, null)).toBe(4);
    expect(ocupacaoNoEscopo(folgas, [])).toBe(4);
    expect(ocupacaoNoEscopo(folgas, undefined)).toBe(4);
  });

  it("com escopo, conta só folgas de pessoas dos cargos", () => {
    expect(ocupacaoNoEscopo(folgas, ["cozinheiro"])).toBe(2);
    expect(ocupacaoNoEscopo(folgas, ["garcom"])).toBe(1);
    expect(ocupacaoNoEscopo(folgas, ["cozinheiro", "garcom"])).toBe(3);
    expect(ocupacaoNoEscopo(folgas, ["chapeiro"])).toBe(0);
  });
});
