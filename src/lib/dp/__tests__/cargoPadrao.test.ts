import { describe, it, expect } from "vitest";
import {
  padraoDoCargo,
  maisFrequente,
  sugerirModoContinuidade,
} from "@/lib/dp/cargoPadrao";

const colab = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  cargo_id: "cargo-1",
  unidade_id: "uni-1",
  setor_id: "setor-a",
  regime: "clt",
  forma_pagamento: "mensalista",
  ...extra,
});

describe("maisFrequente", () => {
  it("ignora vazios e devolve o valor mais repetido", () => {
    expect(maisFrequente(["a", null, "b", "a", ""])).toBe("a");
  });
  it("devolve nulo quando não há valor", () => {
    expect(maisFrequente([null, undefined, ""])).toBeNull();
  });
});

describe("padraoDoCargo", () => {
  it("sem cargo ou sem colaboradores não sugere nada", () => {
    expect(padraoDoCargo({ colaboradores: [] }, { cargoId: "cargo-1" }).base).toBe(0);
    expect(padraoDoCargo({ colaboradores: [colab("a")] }, {}).base).toBe(0);
  });

  it("usa o valor mais praticado no cargo", () => {
    const p = padraoDoCargo(
      {
        colaboradores: [
          colab("a"),
          colab("b"),
          colab("c", { setor_id: "setor-b", forma_pagamento: "horista" }),
        ],
      },
      { cargoId: "cargo-1", unidadeId: "uni-1" },
    );
    expect(p.base).toBe(3);
    expect(p.daUnidade).toBe(true);
    expect(p.setor_id).toBe("setor-a");
    expect(p.forma_pagamento).toBe("mensalista");
    expect(p.regime).toBe("clt");
  });

  it("prioriza quem está na mesma unidade", () => {
    const p = padraoDoCargo(
      {
        colaboradores: [
          colab("a", { unidade_id: "uni-2", setor_id: "setor-z" }),
          colab("b", { unidade_id: "uni-2", setor_id: "setor-z" }),
          colab("c", { unidade_id: "uni-1", setor_id: "setor-a" }),
        ],
      },
      { cargoId: "cargo-1", unidadeId: "uni-1" },
    );
    expect(p.base).toBe(1);
    expect(p.setor_id).toBe("setor-a");
  });

  it("ignora desligados e o próprio colaborador", () => {
    const p = padraoDoCargo(
      {
        colaboradores: [
          colab("a", { data_desligamento: "2026-01-10" }),
          colab("eu", { setor_id: "setor-x" }),
          colab("c"),
        ],
      },
      { cargoId: "cargo-1", unidadeId: "uni-1", excluirId: "eu" },
    );
    expect(p.base).toBe(1);
    expect(p.setor_id).toBe("setor-a");
  });

  it("sugere jornada e dias de quem segue o turno mais comum", () => {
    const p = padraoDoCargo(
      {
        colaboradores: [colab("a"), colab("b"), colab("c")],
        configs: [
          { colaborador_id: "a", turno_padrao_id: "t1", carga_semanal_horas: 44, folga_variavel: true, dias: [{ dow: 1, trabalha: true }] as never },
          { colaborador_id: "b", turno_padrao_id: "t1", carga_semanal_horas: 44, folga_variavel: true },
          { colaborador_id: "c", turno_padrao_id: "t2", carga_semanal_horas: 30, folga_variavel: false },
        ],
      },
      { cargoId: "cargo-1", unidadeId: "uni-1" },
    );
    expect(p.turno_padrao_id).toBe("t1");
    expect(p.carga_semanal_horas).toBe(44);
    expect(p.folga_variavel).toBe(true);
    expect(p.dias?.length).toBe(1);
  });

  it("traz apenas benefícios concedidos à maioria, com o valor mais praticado", () => {
    const p = padraoDoCargo(
      {
        colaboradores: [colab("a"), colab("b"), colab("c")],
        beneficios: [
          { colaborador_id: "a", beneficio_id: "va", valor: 500 },
          { colaborador_id: "b", beneficio_id: "va", valor: 500 },
          { colaborador_id: "c", beneficio_id: "va", valor: 600 },
          { colaborador_id: "a", beneficio_id: "plano", valor: 100 },
          { colaborador_id: "b", beneficio_id: "vt", valor: 200, data_fim: "2026-01-01" },
        ],
      },
      { cargoId: "cargo-1", unidadeId: "uni-1" },
    );
    expect(p.beneficios).toEqual([{ beneficio_id: "va", valor: 500 }]);
  });
});

describe("sugerirModoContinuidade", () => {
  it("mesmo vínculo mantém a contagem", () => {
    expect(sugerirModoContinuidade("clt", "clt")).toBe("continuidade");
  });
  it("troca de vínculo sugere novo contrato", () => {
    expect(sugerirModoContinuidade("clt", "pj")).toBe("novo_contrato");
  });
  it("sem informação mantém a continuidade", () => {
    expect(sugerirModoContinuidade(null, "clt")).toBe("continuidade");
  });
});
