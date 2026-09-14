import { describe, expect, it } from "vitest";
import {
  abonoMaximoLegal,
  decimoTerceiroJaAdiantado,
  diasDescansoDisponiveis,
  fimDoGozo,
  inicioMinimoPedido,
  resumoPedido,
  type PeriodoPedido,
} from "@/lib/dp/ferias-pedido";

const base: PeriodoPedido = {
  fim_aquisitivo: "2026-10-31",
  limite_concessivo: "2027-10-31",
  dias_direito: 30,
  dias_saldo: 30,
  gozos: [],
};

describe("ferias-pedido", () => {
  it("não deixa começar antes de fechar o período aquisitivo", () => {
    expect(inicioMinimoPedido(base, "2026-09-13")).toBe("2026-11-01");
  });

  it("usa amanhã quando o período aquisitivo já fechou", () => {
    expect(inicioMinimoPedido({ ...base, fim_aquisitivo: "2025-10-31" }, "2026-09-13")).toBe(
      "2026-09-14",
    );
  });

  it("limita a venda de dias a um terço do direito", () => {
    expect(abonoMaximoLegal(30)).toBe(10);
    expect(abonoMaximoLegal(24)).toBe(8);
    expect(abonoMaximoLegal(0)).toBe(0);
  });

  it("desconta os dias vendidos do descanso disponível", () => {
    expect(diasDescansoDisponiveis(base, 10)).toBe(20);
    expect(diasDescansoDisponiveis(base, 40)).toBe(0);
  });

  it("calcula o último dia a partir do início e dos dias", () => {
    expect(fimDoGozo("2026-11-01", 20)).toBe("2026-11-20");
    expect(fimDoGozo("", 20)).toBe("");
  });

  it("detecta 13º já adiantado no período", () => {
    expect(decimoTerceiroJaAdiantado(base)).toBe(false);
    expect(
      decimoTerceiroJaAdiantado({
        ...base,
        gozos: [{ adiantar_13: true, status: "aprovado" }],
      }),
    ).toBe(true);
    expect(
      decimoTerceiroJaAdiantado({
        ...base,
        gozos: [{ adiantar_13: true, status: "cancelado" }],
      }),
    ).toBe(false);
  });

  it("resume os limites do pedido", () => {
    const r = resumoPedido(base, 12, 20);
    expect(r.maxAbono).toBe(10);
    expect(r.abonoAcimaDoLegal).toBe(true);
    expect(r.excede).toBe(true);
  });
});
