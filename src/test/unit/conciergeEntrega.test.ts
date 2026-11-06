import { describe, expect, it } from "vitest";
import { prazoConcierge } from "../../../supabase/functions/_shared/concierge-entrega";

const agora = new Date("2026-11-06T05:13:00Z");
describe("Prazo opcional da parametrização", () => {
  it("manter preserva exatamente o prazo vigente", () => {
    expect(prazoConcierge("2026-11-20T05:13:00Z", "manter", agora)).toBe("2026-11-20T05:13:00Z");
  });
  it("reiniciar oferece exatamente 7 dias de hoje", () => {
    expect(prazoConcierge("2026-11-20T05:13:00Z", "reiniciar_7d", agora)).toBe("2026-11-13T05:13:00.000Z");
  });
  it("somar acrescenta 7 dias ao prazo futuro", () => {
    expect(prazoConcierge("2026-11-20T05:13:00Z", "somar_7d", agora)).toBe("2026-11-27T05:13:00.000Z");
  });
  it("somar usa hoje quando o prazo venceu", () => {
    expect(prazoConcierge("2026-11-01T05:13:00Z", "somar_7d", agora)).toBe("2026-11-13T05:13:00.000Z");
  });
});