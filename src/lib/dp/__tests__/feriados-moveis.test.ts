import { describe, expect, it } from "vitest";
import { dataFeriadoMovel, dataDoFeriadoNoAno, feriadosDoAno, ehFeriadoLocal, faltaFeriadoLocal, FERIADOS_NACIONAIS_FIXOS, type FeriadoMovel, type FeriadoRegra } from "../feriados";
import { ordenarFeriadosCadastro } from "../feriados-ordenacao";
import { chaveFeriado } from "@/hooks/useDpFeriados";

const regra = (codigo: FeriadoMovel, extra: Partial<FeriadoRegra> = {}): FeriadoRegra => ({
  id: codigo, nome: codigo, tipo: "movel", codigo_movel: codigo, ...extra,
});

describe("feriados móveis escolhidos pelo nome", () => {
  it.each(["carnaval", "corpus_christi", "sexta_feira_santa"] as const)("%s é cadastro local opcional, não nacional automático", (codigo) => {
    const movel = regra(codigo);
    expect(ehFeriadoLocal(movel)).toBe(true);
    expect(faltaFeriadoLocal([movel], null)).toBe(false);
    expect(faltaFeriadoLocal([{ ...movel, ativo: false }], null)).toBe(true);
  });
  it("completar nacionais mantém somente as nove datas fixas federais", () => {
    expect(FERIADOS_NACIONAIS_FIXOS.map(f => [f.dia, f.mes])).toEqual([
      [1, 1], [21, 4], [1, 5], [7, 9], [12, 10], [2, 11], [15, 11], [20, 11], [25, 12],
    ]);
  });
  it.each([
    [2024, "2024-02-13", "2024-03-29", "2024-05-30"],
    [2025, "2025-03-04", "2025-04-18", "2025-06-19"],
    [2026, "2026-02-17", "2026-04-03", "2026-06-04"],
    [2027, "2027-02-09", "2027-03-26", "2027-05-27"],
    [2028, "2028-02-29", "2028-04-14", "2028-06-15"],
    [2038, "2038-03-09", "2038-04-23", "2038-06-24"],
    [2000, "2000-03-07", "2000-04-21", "2000-06-22"],
    [2100, "2100-02-09", "2100-03-26", "2100-05-27"],
  ])("calcula os três feriados em %i", (ano, carnaval, sexta, corpus) => {
    expect(dataFeriadoMovel("carnaval", Number(ano))).toBe(carnaval);
    expect(dataFeriadoMovel("sexta_feira_santa", Number(ano))).toBe(sexta);
    expect(dataFeriadoMovel("corpus_christi", Number(ano))).toBe(corpus);
  });
  it("respeita o ano inicial", () => {
    expect(dataDoFeriadoNoAno(regra("corpus_christi", { ano_inicio: 2027 }), 2026)).toBeNull();
    expect(dataDoFeriadoNoAno(regra("corpus_christi", { ano_inicio: 2027 }), 2027)).toBe("2027-05-27");
  });
  it("não inclui automaticamente datas não cadastradas nem inativas", () => {
    expect(feriadosDoAno([], 2026)).toEqual([]);
    expect(feriadosDoAno([regra("carnaval", { ativo: false }), regra("corpus_christi")], 2026).map(f => f.data)).toEqual(["2026-06-04"]);
  });
  it("ordena móveis e fixos pela data efetiva", () => {
    expect(ordenarFeriadosCadastro([regra("corpus_christi"), { id: "trabalho", nome: "Trabalho", tipo: "anual", dia: 1, mes: 5 }, regra("carnaval"), regra("sexta_feira_santa")], 2026).map(f => f.id)).toEqual(["carnaval", "sexta_feira_santa", "trabalho", "corpus_christi"]);
  });
  it("distingue as três regras na replicação", () => {
    expect(new Set(["carnaval", "corpus_christi", "sexta_feira_santa"].map(c => chaveFeriado(regra(c as FeriadoMovel)))).size).toBe(3);
  });
  it("não resolve regra móvel sem código ou ano inválido", () => {
    expect(dataDoFeriadoNoAno(regra("carnaval", { codigo_movel: null }), 2026)).toBeNull();
    expect(dataFeriadoMovel("carnaval", 2026.5)).toBeNull();
  });
});