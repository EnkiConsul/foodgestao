import { describe, expect, it } from "vitest";
import {
  errorDetailsToText,
  separarDetalhes,
  usuarioLabel,
  USUARIO_NAO_IDENTIFICADO,
} from "../errorDetailsText";

describe("usuarioLabel", () => {
  it("junta nome e e-mail", () => {
    expect(usuarioLabel({ nome: "MARIA", email: "maria@x.com" })).toBe("MARIA (maria@x.com)");
  });
  it("usa só o que existe", () => {
    expect(usuarioLabel({ nome: "MARIA" })).toBe("MARIA");
    expect(usuarioLabel({ email: "maria@x.com" })).toBe("maria@x.com");
  });
  it("avisa quando não há ninguém logado", () => {
    expect(usuarioLabel({ nome: null, email: "  " })).toBe(USUARIO_NAO_IDENTIFICADO);
  });
});

describe("separarDetalhes", () => {
  it("separa pilha, componentes, navegador e contexto", () => {
    const r = separarDetalhes({ stack: "at foo", componentStack: "at Bar", agent: "Chrome", scope: "dp" });
    expect(r.stack).toBe("at foo");
    expect(r.componentStack).toBe("at Bar");
    expect(r.agent).toBe("Chrome");
    expect(r.extra).toEqual({ scope: "dp" });
  });
});

describe("errorDetailsToText", () => {
  it("inclui tela, usuário e pilha", () => {
    const texto = errorDetailsToText({
      message: "Falha controlada",
      surface: "Validação de chamados",
      action: "salvar",
      route: "/index",
      code: "42501",
      occurrences: 5,
      details: { stack: "Error: x\n at y", agent: "Chrome" },
    });
    expect(texto).toContain("Tela: Validação de chamados");
    expect(texto).toContain("Código: 42501");
    expect(texto).toContain("Repetições: 5");
    expect(texto).toContain(`Usuário: ${USUARIO_NAO_IDENTIFICADO}`);
    expect(texto).toContain("Pilha técnica:");
    expect(texto).toContain("Error: x");
  });

  it("omite campos vazios", () => {
    const texto = errorDetailsToText({ message: "Erro", userName: "JOÃO" });
    expect(texto).toContain("Usuário: JOÃO");
    expect(texto).not.toContain("Código:");
    expect(texto).not.toContain("Pilha técnica:");
  });
});
