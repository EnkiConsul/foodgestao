/**
 * Adulteração de escopo — o escopo consentido é decidido pelo provider e pelo RLS,
 * nunca por query params, por argumentos da ferramenta ou por claims do token.
 *
 * 1. Tela de consentimento: `?scope=...` na URL é ignorado; a decisão só é enviada
 *    com o authorization_id da URL, sem escopo escolhido pelo cliente.
 * 2. Ferramentas MCP: nenhuma ferramenta lê escopos/claims para liberar acesso;
 *    a consulta sempre viaja com o Bearer do usuário e a chave publicável.
 * 3. Endpoint publicado: token forjado com `scope: admin` (assinatura inválida)
 *    e escopos por query param não retornam dados.
 */
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const getSession = vi.fn();
const getAuthorizationDetails = vi.fn();
const approveAuthorization = vi.fn();
const denyAuthorization = vi.fn();
const createClientMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: () => getSession(),
      oauth: {
        getAuthorizationDetails: (id: string) => getAuthorizationDetails(id),
        approveAuthorization: (id: string) => approveAuthorization(id),
        denyAuthorization: (id: string) => denyAuthorization(id),
      },
    },
  },
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
}));

const SUPABASE_URL = "https://grtxmbffgmgnkawlvqhm.supabase.co";
const PUBLISHABLE = "sb_publishable_test_key";
process.env.SUPABASE_URL = SUPABASE_URL;
process.env.SUPABASE_PUBLISHABLE_KEY = PUBLISHABLE;

import OAuthConsent from "@/pages/OAuthConsent";

const SESSION = {
  session: {
    access_token: "scope-secret-access-token",
    user: { id: "user-1", email: "rafael@example.com" },
  },
};

/** O provider é a única fonte do escopo: só openid + email foram consentidos. */
const DETAILS = {
  data: {
    client: { name: "Claude", redirect_uri: "https://claude.ai/callback" },
    scope: "openid email",
  },
  error: null,
};

let hrefSetter: ReturnType<typeof vi.fn>;

function mockLocation(search: string) {
  hrefSetter = vi.fn();
  Object.defineProperty(window, "location", {
    writable: true,
    configurable: true,
    value: {
      pathname: "/.lovable/oauth/consent",
      search,
      origin: "http://localhost:8080",
      get href() {
        return `http://localhost:8080/.lovable/oauth/consent${search}`;
      },
      set href(v: string) {
        hrefSetter(v);
      },
    },
  });
}

function renderConsent(search: string) {
  mockLocation(search);
  return render(
    <MemoryRouter initialEntries={[`/.lovable/oauth/consent${search}`]}>
      <OAuthConsent />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  window.sessionStorage.clear();
  createClientMock.mockImplementation(() => ({ from: vi.fn(() => queryStub()) }));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Consentimento: escopo vindo da URL é ignorado", () => {
  it("exibe apenas os escopos que o provider informou, não os do query param", async () => {
    getSession.mockResolvedValue({ data: SESSION });
    getAuthorizationDetails.mockResolvedValue(DETAILS);

    renderConsent("?authorization_id=auth-123&scope=admin%20write%20all_companies");

    const list = await screen.findByTestId("consent-scopes");
    expect(list).toHaveTextContent(/perfil|e-mail|conta/i);
    expect(list).not.toHaveTextContent(/admin/i);
    expect(list).not.toHaveTextContent(/write/i);
    expect(list).not.toHaveTextContent(/all_companies/i);
  });

  it("consulta o provider somente pelo authorization_id, sem repassar escopo", async () => {
    getSession.mockResolvedValue({ data: SESSION });
    getAuthorizationDetails.mockResolvedValue(DETAILS);

    renderConsent("?authorization_id=auth-123&scope=admin&redirect_uri=https://evil.example");

    await screen.findByRole("button", { name: /autorizar/i });
    expect(getAuthorizationDetails).toHaveBeenCalledTimes(1);
    expect(getAuthorizationDetails).toHaveBeenCalledWith("auth-123");
  });

  it("aprovar envia só o authorization_id e segue o redirect do provider", async () => {
    getSession.mockResolvedValue({ data: SESSION });
    getAuthorizationDetails.mockResolvedValue(DETAILS);
    approveAuthorization.mockResolvedValue({
      data: { redirect_url: "https://claude.ai/callback?code=abc" },
      error: null,
    });

    renderConsent("?authorization_id=auth-123&scope=admin&next=https://evil.example");

    fireEvent.click(await screen.findByRole("button", { name: /autorizar/i }));
    await waitFor(() => expect(approveAuthorization).toHaveBeenCalledWith("auth-123"));
    expect(approveAuthorization.mock.calls[0]).toHaveLength(1);
    // nunca redireciona para destino escolhido via query param
    expect(hrefSetter).toHaveBeenCalledWith("https://claude.ai/callback?code=abc");
    expect(hrefSetter).not.toHaveBeenCalledWith(expect.stringContaining("evil.example"));
  });

  it("authorization_id forjado que o provider rejeita não libera a tela de decisão", async () => {
    getSession.mockResolvedValue({ data: SESSION });
    getAuthorizationDetails.mockResolvedValue({
      data: null,
      error: { message: "Authorization not found" },
    });

    renderConsent("?authorization_id=forjado&scope=admin");

    await waitFor(() => expect(screen.getByText("Authorization not found")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /autorizar/i })).toBeNull();
    expect(approveAuthorization).not.toHaveBeenCalled();
  });
});

/** Query builder encadeável, registrando os filtros aplicados. */
function queryStub(calls?: string[]) {
  const result = { data: [], error: null };
  const builder: Record<string, unknown> = {};
  for (const m of ["select", "eq", "is", "order", "limit", "gte", "lte", "in", "not"]) {
    builder[m] = vi.fn((...args: unknown[]) => {
      calls?.push(`${m}(${args.map((a) => String(a)).join(",")})`);
      return builder as never;
    });
  }
  (builder as { then: unknown }).then = (resolve: (v: typeof result) => unknown) =>
    Promise.resolve(result).then(resolve);
  return builder;
}

type Tool = { name: string; handler: (input: unknown, ctx: unknown) => Promise<{ isError?: boolean }> };

function ctxWithForgedClaims(token: string | null) {
  return {
    isAuthenticated: () => !!token,
    getToken: () => token,
    getUserId: () => "22222222-2222-2222-2222-222222222222",
    getUserEmail: () => null,
    getClientId: () => "evil-client",
    // claims adulteradas: o servidor/RLS não deve confiar nisso
    getClaims: () => ({ scope: "admin all_companies", role: "service_role", app_metadata: { admin: true } }),
  };
}

describe("Ferramentas MCP: claims/argumentos adulterados não ampliam acesso", () => {
  it("nenhuma ferramenta lê escopos ou claims para liberar acesso", () => {
    const dir = path.resolve(process.cwd(), "src/lib/mcp/tools");
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".ts"))) {
      const source = readFileSync(path.join(dir, file), "utf8");
      expect(source, file).not.toMatch(/getClaims|\bscope\b|service_role|app_metadata|is_admin/);
      // a autorização é sempre delegada ao token verificado + RLS
      expect(source, file).toContain("ctx.isAuthenticated()");
      expect(source, file).toContain("supabaseForUser");
    }
  });

  it("token forjado com scope admin ainda roda como o usuário do Bearer, com chave publicável", async () => {
    const listCompanies = (await import("@/lib/mcp/tools/list-companies")).default as unknown as Tool;
    const res = await listCompanies.handler({}, ctxWithForgedClaims("forged.jwt.with-admin-scope"));

    expect(res.isError).toBeFalsy();
    const [url, key, options] = createClientMock.mock.calls[0] as [
      string,
      string,
      { global?: { headers?: Record<string, string> } },
    ];
    expect(url).toBe(SUPABASE_URL);
    expect(key).toBe(PUBLISHABLE);
    expect(key).not.toMatch(/service_role|secret/);
    expect(options.global?.headers?.Authorization).toBe("Bearer forged.jwt.with-admin-scope");
    expect(JSON.stringify(options)).not.toMatch(/admin|all_companies/);
  });

  it("argumentos extras (company_id de terceiro, campos inventados) só filtram, nunca elevam", async () => {
    const calls: string[] = [];
    createClientMock.mockImplementation(() => ({ from: vi.fn(() => queryStub(calls)) }));
    const listTransactions = (await import("@/lib/mcp/tools/list-transactions"))
      .default as unknown as Tool;

    const res = await listTransactions.handler(
      {
        limit: 10,
        company_id: "33333333-3333-3333-3333-333333333333",
        // payload adulterado tentando escapar do RLS
        user_id: "44444444-4444-4444-4444-444444444444",
        scope: "admin",
        bypass_rls: true,
      },
      ctxWithForgedClaims("user-jwt"),
    );

    expect(res.isError).toBeFalsy();
    const applied = calls.join("|");
    expect(applied).toContain("eq(company_id,33333333-3333-3333-3333-333333333333)");
    expect(applied).not.toMatch(/user_id|bypass_rls|scope/);
    expect(createClientMock).toHaveBeenCalledTimes(1);
  });

  it("sem autenticação nenhuma consulta acontece, mesmo com claims de admin", async () => {
    const listColaboradores = (await import("@/lib/mcp/tools/list-colaboradores"))
      .default as unknown as Tool;
    const res = await listColaboradores.handler(
      { company_id: "33333333-3333-3333-3333-333333333333", limit: 10 },
      ctxWithForgedClaims(null),
    );
    expect(res.isError).toBe(true);
    expect(createClientMock).not.toHaveBeenCalled();
  });
});

describe("Endpoint MCP: escopo forjado é rejeitado pelo servidor", () => {
  const ENDPOINT = `${SUPABASE_URL}/functions/v1/mcp`;
  let deployed = true;

  /** JWT não assinado alegando escopos privilegiados. */
  const forgedToken = (() => {
    const b64 = (o: unknown) =>
      Buffer.from(JSON.stringify(o)).toString("base64url");
    return `${b64({ alg: "none", typ: "JWT" })}.${b64({
      sub: "44444444-4444-4444-4444-444444444444",
      aud: "authenticated",
      role: "service_role",
      scope: "openid email admin all_companies",
      exp: Math.floor(Date.now() / 1000) + 3600,
    })}.`;
  })();

  const call = (query = "", headers: Record<string, string> = {}) =>
    fetch(ENDPOINT + query, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        ...headers,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "list_companies", arguments: {} },
      }),
    });

  beforeAll(async () => {
    try {
      const res = await call();
      deployed = res.status !== 404;
      await res.text();
    } catch {
      deployed = false;
    }
  });

  it("rejeita token com scope/role forjados (assinatura inválida)", async () => {
    if (!deployed) return;
    const res = await call("", { Authorization: `Bearer ${forgedToken}` });
    const body = await res.text();
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(body).not.toMatch(/"companies"|cnpj/i);
  });

  it("escopo em query param não substitui a autorização", async () => {
    if (!deployed) return;
    const res = await call("?scope=admin%20all_companies&role=service_role");
    const body = await res.text();
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(body).not.toMatch(/"companies"|cnpj/i);
  });

  it("apikey/anon em header não abre acesso a dados", async () => {
    if (!deployed) return;
    const res = await call("", { apikey: PUBLISHABLE, "x-scope": "admin" });
    const body = await res.text();
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(body).not.toMatch(/"companies"|cnpj/i);
  });
});
