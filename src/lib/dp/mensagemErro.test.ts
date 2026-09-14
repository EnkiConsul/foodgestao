import { describe, expect, it } from "vitest";
import { mensagemErro, tipoErro } from "@/lib/dp/mensagemErro";

describe("classificação de erro do Pessoas 360°", () => {
  it("reconhece erro de permissão pelo código do banco", () => {
    expect(tipoErro({ code: "42501", message: "permission denied" })).toBe("permissao");
    expect(tipoErro({ code: "PGRST301", message: "JWT" })).toBe("permissao");
  });

  it("erro de permissão nunca vira lista vazia: gera mensagem própria", () => {
    const msg = mensagemErro({ code: "42501", message: "permission denied for table x" });
    expect(msg.length).toBeGreaterThan(0);
    expect(msg.toLowerCase()).not.toContain("nenhum registro");
    expect(msg.toLowerCase()).not.toContain("permission denied for table");
  });

  it("reconhece falha de rede", () => {
    expect(tipoErro(new TypeError("Failed to fetch"))).toBe("rede");
  });

  it("erro desconhecido ainda produz mensagem legível", () => {
    expect(mensagemErro(new Error("boom"))).toBeTruthy();
    expect(mensagemErro(null)).toBeTruthy();
  });
});
