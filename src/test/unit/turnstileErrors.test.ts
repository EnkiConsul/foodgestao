import { describe, it, expect } from "vitest";
import { describeTurnstileError, OFFICIAL_DOMAIN } from "@/lib/auth/turnstileErrors";

describe("describeTurnstileError", () => {
  it("explica hostname não autorizado (110200)", () => {
    const info = describeTurnstileError("110200", "preview.lovableproject.com");
    expect(info.title).toContain("indisponível neste domínio");
    expect(info.message).toContain("preview.lovableproject.com");
    expect(info.hint).toContain(OFFICIAL_DOMAIN);
    expect(info.hint).toContain("Turnstile");
  });

  it("aceita variações do código 110200", () => {
    const info = describeTurnstileError("110200:1234", "aveto360.com");
    expect(info.title).toContain("indisponível neste domínio");
  });

  it("explica falha de carregamento do script", () => {
    const info = describeTurnstileError("script-load-failed", "aveto360.com");
    expect(info.title).toContain("carregar");
    expect(info.hint).toContain("challenges.cloudflare.com");
  });

  it("trata código desconhecido", () => {
    const info = describeTurnstileError("xyz", "aveto360.com");
    expect(info.code).toBe("xyz");
    expect(info.message).toContain("xyz");
  });

  it("usa fallback quando não há hostname", () => {
    const info = describeTurnstileError("110200", "");
    expect(info.message).toContain("este domínio");
  });
});
