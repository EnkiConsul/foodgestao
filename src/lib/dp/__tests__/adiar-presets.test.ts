import { describe, expect, it } from "vitest";
import { adiarPresets } from "@/lib/dp/adiar-presets";

const mapa = (d: Date) => Object.fromEntries(adiarPresets(d).map((p) => [p.chave, p.data]));

describe("atalhos de adiamento", () => {
  it("sexta 16/10/2026: amanhã 17, segunda 19, fim do mês 31", () => {
    const m = mapa(new Date(2026, 9, 16));
    expect(m.amanha).toBe("2026-10-17");
    expect(m.segunda).toBe("2026-10-19");
    expect(m.fim_mes).toBe("2026-10-31");
  });
  it("segunda leva para a segunda seguinte, não para hoje", () => {
    expect(mapa(new Date(2026, 9, 19)).segunda).toBe("2026-10-26");
  });
  it("domingo não repete a mesma data em amanhã e segunda", () => {
    const l = adiarPresets(new Date(2026, 9, 18));
    expect(l.filter((p) => p.data === "2026-10-19")).toHaveLength(1);
  });
  it("último dia do mês: fim do mês vira amanhã", () => {
    expect(mapa(new Date(2026, 9, 31)).amanha).toBe("2026-11-01");
  });
});
