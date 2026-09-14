import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { clientIp, isRateLimited, sha256Hex } from "./rate-limit.ts";

/** Contadores guardados fora da instância (tabela), não em memória do processo. */
function fakeAdmin() {
  const linhas = new Map<string, number>();
  const client = {
    linhas,
    from(_t: string) {
      return {
        select(_c: string) {
          const filtros: Record<string, string> = {};
          const api = {
            eq(coluna: string, valor: string) {
              filtros[coluna] = valor;
              return api;
            },
            maybeSingle() {
              const chave = `${filtros.bucket}|${filtros.key_hash}|${filtros.window_start}`;
              const count = linhas.get(chave);
              return Promise.resolve({ data: count ? { count } : null, error: null });
            },
          };
          return api;
        },
        upsert(row: Record<string, unknown>) {
          linhas.set(`${row.bucket}|${row.key_hash}|${row.window_start}`, row.count as number);
          return Promise.resolve({ error: null });
        },
      };
    },
  };
  // deno-lint-ignore no-explicit-any
  return client as any;
}

Deno.test("limite persiste entre pedidos e é por chave", async () => {
  const admin = fakeAdmin();
  const a = await sha256Hex("ip:1.1.1.1");
  const b = await sha256Hex("ip:2.2.2.2");

  for (let i = 0; i < 3; i++) {
    assertEquals(await isRateLimited(admin, "teste", a, 3), false);
  }
  assertEquals(await isRateLimited(admin, "teste", a, 3), true);
  // Outra chave começa do zero.
  assertEquals(await isRateLimited(admin, "teste", b, 3), false);
  // O contador vive na tabela, não na memória do processo.
  assert(admin.linhas.size >= 2);
});

Deno.test("IP do chamador vem do cabeçalho de proxy", () => {
  const req = new Request("https://x.test", {
    headers: { "x-forwarded-for": "9.9.9.9, 10.0.0.1" },
  });
  assertEquals(clientIp(req), "9.9.9.9");
  assertEquals(clientIp(new Request("https://x.test")), "unknown");
});
