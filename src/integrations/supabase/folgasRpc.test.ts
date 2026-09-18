import { it, expect, vi } from "vitest";

vi.mock("./client", async () => {
  const { createClient } = await import("@supabase/supabase-js");
  return { supabase: createClient("https://example.invalid", "test-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (_url, init) => new Response(init?.body as string, {
      status: 200, headers: { "Content-Type": "application/json" },
    }) },
  }) };
});
import { aplicarFolgas, planejarFolgas } from "./folgasRpc";

it.each([null, "unit-id"])("preserva o escopo de unidade %s no corpo enviado ao PostgREST", async (_unidade) => {
  const args = { _company: "company-id", _competencia: "2026-09-01", _unidade };
  expect((await planejarFolgas(args)).data).toEqual(args);
  expect((await aplicarFolgas({ ...args, _itens: [] })).data).toEqual({ ...args, _itens: [] });
});
