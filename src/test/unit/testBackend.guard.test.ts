import { describe, it, expect } from "vitest";
import { resolveTestBackend, HOMOLOGACAO_REF, PRODUCAO_REF } from "../helpers/testBackend";

const jwt = (ref: string) =>
  `x.${Buffer.from(JSON.stringify({ ref, role: "anon" })).toString("base64url")}.y`;

describe("backend dos testes reais — só homologação", () => {
  it("sem variáveis: não configurado e sem endereço real", () => {
    const b = resolveTestBackend({ VITE_SUPABASE_URL: `https://${PRODUCAO_REF}.supabase.co` });
    expect(b.configured).toBe(false);
    expect(b.url).not.toContain(PRODUCAO_REF);
    expect(b.url.endsWith(".invalid")).toBe(true);
  });

  it("URL de produção é bloqueada", () => {
    const b = resolveTestBackend({
      TEST_SUPABASE_URL: `https://${PRODUCAO_REF}.supabase.co`,
      TEST_SUPABASE_ANON_KEY: jwt(PRODUCAO_REF),
    });
    expect(b.configured).toBe(false);
    expect(b.url).not.toContain(PRODUCAO_REF);
  });

  it("chave de produção com URL de homologação é bloqueada", () => {
    const b = resolveTestBackend({
      TEST_SUPABASE_URL: `https://${HOMOLOGACAO_REF}.supabase.co`,
      TEST_SUPABASE_ANON_KEY: jwt(PRODUCAO_REF),
    });
    expect(b.configured).toBe(false);
  });

  it("projeto desconhecido é bloqueado", () => {
    const b = resolveTestBackend({
      TEST_SUPABASE_URL: "https://outroprojeto.supabase.co",
      TEST_SUPABASE_ANON_KEY: jwt("outroprojeto"),
    });
    expect(b.configured).toBe(false);
  });

  it("homologação válida é aceita", () => {
    const b = resolveTestBackend({
      TEST_SUPABASE_URL: `https://${HOMOLOGACAO_REF}.supabase.co`,
      TEST_SUPABASE_ANON_KEY: jwt(HOMOLOGACAO_REF),
    });
    expect(b.configured).toBe(true);
    expect(b.url).toBe(`https://${HOMOLOGACAO_REF}.supabase.co`);
  });
});
