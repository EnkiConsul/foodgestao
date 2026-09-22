import { describe, it, expect } from "vitest";
import { listaCargosDaUnidade } from "../cargos-unidade";

const cargos = [{ id: "a" }, { id: "b" }, { id: "c" }];
const base = {
  cargosEmpresa: cargos,
  vinculados: [] as string[],
  unidadeId: "u1",
  carregandoVinculos: false,
  carregandoCargos: false,
  erro: false,
};

describe("listaCargosDaUnidade", () => {
  it("não lista nada antes de escolher a unidade", () => {
    const r = listaCargosDaUnidade({ ...base, unidadeId: null });
    expect(r.cargos).toEqual([]);
    expect(r.motivo).toBe("sem_unidade");
  });

  it("avisa que está carregando em vez de mostrar lista vazia", () => {
    const r = listaCargosDaUnidade({ ...base, carregandoVinculos: true });
    expect(r.motivo).toBe("carregando");
    expect(r.aviso).toMatch(/Carregando/);
  });

  it("cai para todos os cargos da empresa quando a leitura falha", () => {
    const r = listaCargosDaUnidade({ ...base, erro: true });
    expect(r.cargos).toHaveLength(3);
    expect(r.motivo).toBe("erro");
  });

  it("usa os cargos vinculados quando existem", () => {
    const r = listaCargosDaUnidade({ ...base, vinculados: ["b", "c"] });
    expect(r.cargos.map((c) => c.id)).toEqual(["b", "c"]);
    expect(r.aviso).toBe("");
  });

  it("mostra todos com aviso quando a unidade não tem vínculo", () => {
    const r = listaCargosDaUnidade(base);
    expect(r.cargos).toHaveLength(3);
    expect(r.motivo).toBe("sem_vinculo");
  });

  it("mostra todos com aviso quando o vínculo aponta cargo indisponível", () => {
    const r = listaCargosDaUnidade({ ...base, vinculados: ["zzz"] });
    expect(r.cargos).toHaveLength(3);
    expect(r.motivo).toBe("vinculo_indisponivel");
  });

  it("pede cadastro de cargo quando a empresa não tem nenhum", () => {
    const r = listaCargosDaUnidade({ ...base, cargosEmpresa: [] });
    expect(r.cargos).toEqual([]);
    expect(r.motivo).toBe("sem_cargos_empresa");
  });
});
