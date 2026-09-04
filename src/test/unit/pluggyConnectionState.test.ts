import { describe, it, expect } from "vitest";
import { connectionState } from "@/lib/pluggy/connectionState";

describe("connectionState", () => {
  it("marca como desconectado quando o consentimento foi revogado", () => {
    expect(connectionState("revoked", { count: 2, paused: 2 })).toBe("desconectado");
    expect(connectionState("deleted", { count: 0, paused: 0 })).toBe("desconectado");
  });

  it("marca como pausado quando todas as contas estão pausadas", () => {
    expect(connectionState("updated", { count: 3, paused: 3 })).toBe("pausado");
  });

  it("segue ativo com pausa parcial ou sem pausas", () => {
    expect(connectionState("updated", { count: 3, paused: 1 })).toBe("ativo");
    expect(connectionState("updated", { count: 3, paused: 0 })).toBe("ativo");
    expect(connectionState("login_error", { count: 0, paused: 0 })).toBe("ativo");
  });
});
