import { describe, expect, it } from "vitest";
import { dependentesDaFicha, inferirFormaPagamento, inferirRegime, salarioDaFicha } from "../inferencia";

const jornada = (n: number) => ({ dias: Array.from({ length: 7 }, (_, i) => ({ dow: i, trabalha: i < n })) }) as never;

describe("inferência da ficha", () => {
  it("PIS ou FGTS indicam CLT", () => {
    expect(inferirRegime({ pis_nit: "123" })).toBe("clt");
    expect(inferirRegime({ fgts_optante: true })).toBe("clt");
    expect(inferirRegime({})).toBeNull();
  });
  it("rotina semanal indica mensalista; hora indica horista", () => {
    expect(inferirFormaPagamento({}, jornada(6))).toBe("mensalista");
    expect(inferirFormaPagamento({ salario_periodo: "Hora" }, jornada(6))).toBe("horista");
    expect(inferirFormaPagamento({}, jornada(2))).toBeNull();
  });
  it("lê salário e só filhos/cônjuge viram dependentes", () => {
    expect(salarioDaFicha({ salario: "1.750,00" })).toBe(1750);
    const deps = dependentesDaFicha({ familiares: [
      { nome: "Ana Souza", parentesco: "Filha" }, { nome: "José Souza", parentesco: "Pai" },
    ] });
    expect(deps).toHaveLength(1);
    expect(deps[0]).toMatchObject({ nome: "ANA SOUZA", parentesco: "filho" });
  });
});
