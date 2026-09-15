import { describe, expect, it } from "vitest";
import {
  diasSugeridos,
  fracoesExistentes,
  inicioSugeridoPedido,
  type PeriodoPedido,
} from "@/lib/dp/ferias-pedido";

const periodo = (over: Partial<PeriodoPedido> = {}): PeriodoPedido => ({
  fim_aquisitivo: "2026-01-31",
  limite_concessivo: "2027-01-31",
  dias_direito: 30,
  dias_saldo: 30,
  gozos: [],
  ...over,
});

describe("inicioSugeridoPedido", () => {
  it("usa hoje mais o prazo de aviso quando o período já venceu", () => {
    expect(inicioSugeridoPedido(periodo(), "2026-09-15", 30)).toBe("2026-10-15");
  });

  it("usa o início permitido do gozo quando ele é mais adiante", () => {
    const p = periodo({ fim_aquisitivo: "2027-03-31", limite_concessivo: "2028-03-31" });
    expect(inicioSugeridoPedido(p, "2026-09-15", 30)).toBe("2027-04-01");
  });

  it("nunca sugere data depois do prazo legal para tirar as férias", () => {
    const p = periodo({ limite_concessivo: "2026-09-20" });
    expect(inicioSugeridoPedido(p, "2026-09-15", 30)).toBe("2026-09-20");
  });
});

describe("diasSugeridos", () => {
  it("sugere o saldo inteiro sem abono", () => {
    expect(diasSugeridos(30, 0)).toBe(30);
  });

  it("desconta os dias vendidos", () => {
    expect(diasSugeridos(30, 10)).toBe(20);
  });

  it("não fica negativo", () => {
    expect(diasSugeridos(5, 10)).toBe(0);
  });
});

describe("fracoesExistentes", () => {
  it("ignora períodos cancelados e sem dias", () => {
    const p = periodo({
      gozos: [
        { adiantar_13: false, status: "aprovado", dias: 14 },
        { adiantar_13: false, status: "cancelado", dias: 10 },
        { adiantar_13: false, status: "planejado", dias: 0 },
      ],
    });
    expect(fracoesExistentes(p)).toEqual([{ dias: 14 }]);
  });
});
