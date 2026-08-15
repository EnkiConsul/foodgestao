import { describe, it, expect } from "vitest";
import { toProperName } from "@/lib/text/properName";

describe("toProperName", () => {
  it("normaliza razão social em caixa alta", () => {
    expect(toProperName("NAGASUBIAS CORPORATE LTDA")).toBe("Nagasubias Corporate LTDA");
    expect(toProperName("EMPORIO ELDORADO MILAO LTDA")).toBe("Emporio Eldorado Milao LTDA");
    expect(toProperName("SANEAMENTO DE GOIAS S/A")).toBe("Saneamento de Goias S/A");
    expect(toProperName("CARREFOUR")).toBe("Carrefour");
  });

  it("normaliza nome de pessoa", () => {
    expect(toProperName("SUZINEY CARLOS DE MELO")).toBe("Suziney Carlos de Melo");
  });

  it("preserva siglas curtas e marcas em caixa mista", () => {
    expect(toProperName("GR ECOM LTDA")).toBe("GR Ecom LTDA");
    expect(toProperName("Frouhlic - Aluguel Sala")).toBe("Frouhlic - Aluguel Sala");
    expect(toProperName("Jiu-Jitsu")).toBe("Jiu-Jitsu");
  });

  it("trata vazios", () => {
    expect(toProperName(null)).toBe("");
    expect(toProperName("  ")).toBe("");
  });
});
