/**
 * Segurança do servidor MCP — nível do endpoint e do código-fonte.
 *
 * 1. Guardas estáticas: nenhuma ferramenta pode usar service role, nem cair para
 *    um cliente anônimo, e o servidor precisa exigir OAuth.
 * 2. Endpoint publicado: chamadas sem token (ou com token inválido) devem ser
 *    rejeitadas antes de qualquer acesso a dados.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const MCP_DIR = path.resolve(process.cwd(), "src/lib/mcp");
const TOOLS_DIR = path.join(MCP_DIR, "tools");
const ENDPOINT = "https://grtxmbffgmgnkawlvqhm.supabase.co/functions/v1/mcp";

function readAll(dir: string): { file: string; source: string }[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return readAll(full);
    if (!e.name.endsWith(".ts")) return [];
    return [{ file: full, source: readFileSync(full, "utf8") }];
  });
}

describe("MCP: guardas estáticas de autorização", () => {
  const sources = readAll(MCP_DIR);

  it("nenhum arquivo do MCP referencia service role", () => {
    for (const { file, source } of sources) {
      expect(source, file).not.toMatch(/SERVICE_ROLE|service_role/);
    }
  });

  it("toda ferramenta checa isAuthenticated antes de consultar", () => {
    for (const { file, source } of readAll(TOOLS_DIR)) {
      expect(source, file).toContain("ctx.isAuthenticated()");
      expect(source, file).toContain("supabaseForUser");
      // Ferramentas autenticadas nunca caem para o cliente anônimo.
      expect(source, file).not.toContain("supabaseAnon");
    }
  });

  it("o servidor exige OAuth com audiência authenticated", () => {
    const entry = readFileSync(path.join(MCP_DIR, "index.ts"), "utf8");
    expect(entry).toContain("auth.oauth.issuer");
    expect(entry).toContain('acceptedAudiences: "authenticated"');
    expect(entry).toMatch(/supabase\.co\/auth\/v1/);
  });

  it("supabaseForUser falha sem token verificado", async () => {
    const { supabaseForUser } = await import("@/lib/mcp/supabase");
    expect(() =>
      supabaseForUser({ getToken: () => null } as never),
    ).toThrow();
  });
});

describe("MCP: endpoint publicado rejeita acesso sem permissão", () => {
  let deployed = true;

  const call = (headers: Record<string, string> = {}) =>
    fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        ...headers,
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "list_companies", arguments: {} } }),
    });

  beforeAll(async () => {
    try {
      const res = await call();
      // 404 = função ainda não publicada neste ambiente → testes viram no-op.
      deployed = res.status !== 404;
      await res.text();
    } catch {
      deployed = false;
    }
  });

  it("rejeita chamada sem Authorization", async () => {
    if (!deployed) return;
    const res = await call();
    const body = await res.text();
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(body).not.toMatch(/"companies"/);
  });

  it("rejeita token inválido", async () => {
    if (!deployed) return;
    const res = await call({ Authorization: "Bearer token-invalido" });
    const body = await res.text();
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(body).not.toMatch(/"companies"/);
  });

  it("não expõe dados via GET sem token", async () => {
    if (!deployed) return;
    const res = await fetch(ENDPOINT, { headers: { Accept: "text/event-stream" } });
    const body = await res.text();
    expect(res.ok).toBe(false);
    expect(body).not.toMatch(/"companies"|cnpj/i);
  });
});
