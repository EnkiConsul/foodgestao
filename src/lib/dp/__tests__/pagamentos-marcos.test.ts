import { describe, expect, it } from "vitest";
import {
  diaFixoNoMes,
  feriadosQueSuspendemPrazo,
  marcosPagamentoDoMes,
  quintoDiaUtil,
  unirMarcosUnidades,
} from "../pagamentos-marcos";

describe("5º dia útil", () => {
  it("novembro/2026 com Finados: cai no sábado 07/11, sem antecipar para sexta", () => {
    const naoUteis = feriadosQueSuspendemPrazo([{ data: "2026-11-02", categoria: "nacional" }]);
    expect(quintoDiaUtil("2026-11", naoUteis)).toBe("2026-11-07");
  });

  it("sem feriado, sábado conta como dia útil (novembro/2026 → sexta 06/11)", () => {
    expect(quintoDiaUtil("2026-11", new Set())).toBe("2026-11-06");
  });

  it("feriado municipal da loja também empurra a data", () => {
    const naoUteis = feriadosQueSuspendemPrazo([
      { data: "2026-11-02", categoria: "nacional" },
      { data: "2026-11-05", categoria: "municipal" },
    ]);
    expect(quintoDiaUtil("2026-11", naoUteis)).toBe("2026-11-09");
  });

  it("feriado só de convenção (sindicato) não suspende o prazo legal", () => {
    const naoUteis = feriadosQueSuspendemPrazo([{ data: "2026-11-03", categoria: "sindicato" }]);
    expect(quintoDiaUtil("2026-11", naoUteis)).toBe("2026-11-06");
  });
});

describe("dia fixo", () => {
  it("usa o último dia em meses mais curtos", () => {
    expect(diaFixoNoMes("2027-02", 31)).toBe("2027-02-28");
    expect(diaFixoNoMes("2026-11", 5)).toBe("2026-11-05");
  });
});

describe("marcos do mês", () => {
  it("salário pelo 5º dia útil, adiantamento e VA em ordem de data", () => {
    const marcos = marcosPagamentoDoMes(
      "2026-11",
      { salario: { tipo: "quinto_dia_util" }, adiantamentoDia: 20, vaDia: 25 },
      new Set(["2026-11-02"]),
    );
    expect(marcos.map((m) => [m.tipo, m.data])).toEqual([
      ["salario", "2026-11-07"],
      ["adiantamento", "2026-11-20"],
      ["va", "2026-11-25"],
    ]);
    expect(marcos[0].detalhe).toContain("outubro");
  });

  it("sem regras (não optante, sem VA, salário não informado) não promete nada", () => {
    expect(marcosPagamentoDoMes("2026-11", { salario: { tipo: null }, adiantamentoDia: null, vaDia: null }, new Set())).toEqual([]);
  });

  it("une o mesmo marco de lojas diferentes na mesma data", () => {
    const a = marcosPagamentoDoMes("2026-11", { salario: { tipo: "dia_fixo", dia: 5 } }, new Set());
    const b = marcosPagamentoDoMes("2026-11", { salario: { tipo: "dia_fixo", dia: 5 } }, new Set());
    const unidos = unirMarcosUnidades([{ unidade: "Loja A", marcos: a }, { unidade: "Loja B", marcos: b }]);
    expect(unidos).toHaveLength(1);
    expect(unidos[0].unidades).toEqual(["Loja A", "Loja B"]);
  });
});
