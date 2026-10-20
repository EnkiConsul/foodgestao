import { describe, it, expect } from "vitest";
import { estadoEfetivo } from "./vagas";

describe("estadoEfetivo", () => {
  const agora = new Date("2026-10-20T12:00:00Z");
  it("ativa dentro dos 30 dias continua ativa", () => {
    expect(estadoEfetivo("ativa", "2026-11-19T12:00:00Z", agora)).toBe("ativa");
  });
  it("ativa com prazo vencido vira expirada", () => {
    expect(estadoEfetivo("ativa", "2026-10-20T11:59:00Z", agora)).toBe("expirada");
  });
  it("pausada permanece pausada", () => {
    expect(estadoEfetivo("pausada", null, agora)).toBe("pausada");
  });
});
