/**
 * Segurança do servidor MCP — nível das ferramentas.
 *
 * Garante que nenhuma ferramenta consulta o banco sem uma identidade verificada
 * e que, quando autenticada, a consulta sempre viaja com o Bearer do usuário
 * (para o RLS rodar como ele) usando somente a chave publicável.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const createClientMock = vi.fn();

vi.mock("@supabase/supabase-js", () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
}));

const SUPABASE_URL = "https://grtxmbffgmgnkawlvqhm.supabase.co";
const PUBLISHABLE = "sb_publishable_test_key";

process.env.SUPABASE_URL = SUPABASE_URL;
process.env.SUPABASE_PUBLISHABLE_KEY = PUBLISHABLE;

type Tool = {
  name: string;
  annotations?: Record<string, unknown>;
  handler: (input: unknown, ctx: unknown) => Promise<{ isError?: boolean }>;
};

const listCompanies = (await import("@/lib/mcp/tools/list-companies")).default as unknown as Tool;
const listAccounts = (await import("@/lib/mcp/tools/list-accounts")).default as unknown as Tool;
const listTransactions = (await import("@/lib/mcp/tools/list-transactions"))
  .default as unknown as Tool;
const listColaboradores = (await import("@/lib/mcp/tools/list-colaboradores"))
  .default as unknown as Tool;

/** Cada ferramenta com um input mínimo válido. */
const TOOLS: { tool: Tool; input: Record<string, unknown> }[] = [
  { tool: listCompanies, input: {} },
  { tool: listAccounts, input: {} },
  { tool: listTransactions, input: { limit: 10 } },
  {
    tool: listColaboradores,
    input: { company_id: "11111111-1111-1111-1111-111111111111", apenas_ativos: true, limit: 10 },
  },
];

/** Query builder encadeável que resolve com uma linha fictícia. */
function queryStub() {
  const result = { data: [], error: null };
  const builder: Record<string, unknown> = {};
  const chain = () => builder as never;
  for (const m of ["select", "eq", "is", "order", "limit", "gte", "lte", "in", "not"]) {
    builder[m] = vi.fn(chain);
  }
  (builder as { then: unknown }).then = (resolve: (v: typeof result) => unknown) =>
    Promise.resolve(result).then(resolve);
  return builder;
}

function clientStub() {
  const from = vi.fn(() => queryStub());
  return { from };
}

function ctx({ token, userId }: { token?: string | null; userId?: string } = {}) {
  return {
    isAuthenticated: () => !!token,
    getToken: () => token ?? null,
    getUserId: () => userId ?? null,
    getUserEmail: () => null,
    getClientId: () => "test-client",
    getClaims: () => ({}),
  };
}

beforeEach(() => {
  createClientMock.mockReset();
  createClientMock.mockImplementation(() => clientStub());
});

describe("MCP: ferramentas exigem identidade verificada", () => {
  for (const { tool, input } of TOOLS) {
    it(`${tool.name} recusa chamada sem autenticação e não toca no banco`, async () => {
      const res = await tool.handler(input, ctx({ token: null }));
      expect(res.isError).toBe(true);
      expect(createClientMock).not.toHaveBeenCalled();
    });

    it(`${tool.name} propaga o token do usuário (RLS como o usuário) sem service role`, async () => {
      const res = await tool.handler(
        input,
        ctx({ token: "user-jwt-abc", userId: "22222222-2222-2222-2222-222222222222" }),
      );
      expect(res.isError).toBeFalsy();
      expect(createClientMock).toHaveBeenCalledTimes(1);
      const [url, key, options] = createClientMock.mock.calls[0] as [
        string,
        string,
        { global?: { headers?: Record<string, string> } },
      ];
      expect(url).toBe(SUPABASE_URL);
      expect(key).toBe(PUBLISHABLE);
      expect(options.global?.headers?.Authorization).toBe("Bearer user-jwt-abc");
    });

    it(`${tool.name} é declarada como somente leitura`, () => {
      expect(tool.annotations?.readOnlyHint).toBe(true);
    });
  }
});
