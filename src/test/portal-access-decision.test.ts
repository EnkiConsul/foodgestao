import { describe, it, expect } from "vitest";
import { decidirAcessoPortal } from "@/lib/portalAccessDecision";

describe("acesso ao portal nega por padrão", () => {
  it("libera somente com permissão explícita", () => {
    expect(decidirAcessoPortal({ data: true, error: null })).toBe("liberado");
  });

  it("nega quando a conta está bloqueada", () => {
    expect(decidirAcessoPortal({ data: false, error: null })).toBe("bloqueado");
  });

  it("nega quando a verificação falha", () => {
    expect(decidirAcessoPortal({ data: null, error: { message: "network" } })).toBe("falha");
    expect(decidirAcessoPortal({ data: true, error: { message: "network" } })).toBe("falha");
  });

  it("nega com resposta vazia ou inesperada", () => {
    expect(decidirAcessoPortal({ data: null, error: null })).toBe("falha");
    expect(decidirAcessoPortal({ data: undefined, error: null })).toBe("falha");
    expect(decidirAcessoPortal({ data: "true", error: null })).toBe("falha");
    expect(decidirAcessoPortal({ data: [], error: null })).toBe("falha");
  });
});
