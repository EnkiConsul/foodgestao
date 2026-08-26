import { describe, it, expect } from "vitest";
import { sanitizeRedirect, DEFAULT_REDIRECT } from "@/lib/safeRedirect";

describe("[security] sanitizeRedirect", () => {
  it("aceita caminhos internos", () => {
    expect(sanitizeRedirect("/dashboard")).toBe("/dashboard");
    expect(sanitizeRedirect("/dp/meu/ponto?mes=2026-08")).toBe("/dp/meu/ponto?mes=2026-08");
    expect(sanitizeRedirect("/relatorios#top")).toBe("/relatorios#top");
  });

  it("cai no padrão para vazio, nulo ou malformado", () => {
    for (const v of [null, undefined, "", "   ", "\n\t", "dashboard", "?x=1", "%E0%A4%A"]) {
      expect(sanitizeRedirect(v as string | null)).toBe(DEFAULT_REDIRECT);
    }
  });

  it("bloqueia URLs externas e esquemas perigosos", () => {
    const hostis = [
      "http://evil.com",
      "https://evil.com/x",
      "//evil.com",
      "/\\evil.com",
      "\\\\evil.com",
      "/\\/evil.com",
      "javascript:alert(1)",
      "/javascript:alert(1)",
      "data:text/html,<script>",
      " //evil.com",
      "%2F%2Fevil.com",
      "https%3A%2F%2Fevil.com",
      "http:/\\evil.com",
    ];
    for (const v of hostis) {
      expect(sanitizeRedirect(v), v).toBe(DEFAULT_REDIRECT);
    }
  });

  it("evita loop voltando para as telas de acesso e para a raiz", () => {
    expect(sanitizeRedirect("/")).toBe(DEFAULT_REDIRECT);
    expect(sanitizeRedirect("/auth")).toBe(DEFAULT_REDIRECT);
    expect(sanitizeRedirect("/auth?redirect=/x")).toBe(DEFAULT_REDIRECT);
    expect(sanitizeRedirect("/reset-password")).toBe(DEFAULT_REDIRECT);
  });

  it("respeita fallback customizado", () => {
    expect(sanitizeRedirect("http://evil.com", "/dp/meu")).toBe("/dp/meu");
  });
});
