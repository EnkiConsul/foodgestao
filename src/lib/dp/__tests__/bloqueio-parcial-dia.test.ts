import { describe, it, expect } from "vitest";
import { bloqueiosParciaisUnidade, type RegraRow } from "../bloqueio-rules";

const r = (over: Partial<RegraRow>): RegraRow => ({ id: "r", company_id: "c", nome: "X", tipo: "fixa_anual", mes: 10, dia: 11, ativo: true,
  regra_json: { aplicacao: "unica", ano_referencia: 2026, meses: [10], dias: [11], alvo_tipo: "cargo", cargo_ids: ["g", "s"] }, ...over });
const args = (regras: RegraRow[]) => ({ regras, vinculos: [], unidadeId: "u", from: new Date(2026, 9, 1), to: new Date(2026, 9, 31) });

describe("bloqueiosParciaisUnidade", () => {
  it("dia com regra por cargo vira bloqueio parcial pontual com os cargos", () => {
    const p = bloqueiosParciaisUnidade(args([r({})])).get("2026-10-11")!;
    expect(p[0].pontual).toBe(true);
    expect(p[0].ids).toEqual(["g", "s"]);
  });
  it("regra para todos não é parcial", () => {
    const m = bloqueiosParciaisUnidade(args([r({ regra_json: { meses: [10], dias: [11], alvo_tipo: "todos" } })]));
    expect(m.size).toBe(0);
  });
});
