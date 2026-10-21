import { assertEquals } from "jsr:@std/assert@1";
import { cacheValido, pixAtivo, CACHE_MS } from "./billing-formas.ts";

Deno.test("PIX só com chave Pix ACTIVE", () => {
  assertEquals(pixAtivo({ data: [] }), false);
  assertEquals(pixAtivo({ data: [{ status: "AWAITING_ACTIVATION" }] }), false);
  assertEquals(pixAtivo({ data: [{ status: "ACTIVE" }] }), true);
  assertEquals(pixAtivo(null), false);
});
Deno.test("cache vale 10 minutos", () => {
  const agora = Date.now();
  assertEquals(CACHE_MS, 600000);
  assertEquals(cacheValido({ pix: false, verificado_em: new Date(agora - 9 * 60000).toISOString() }, agora), true);
  assertEquals(cacheValido({ pix: true, verificado_em: new Date(agora - 11 * 60000).toISOString() }, agora), false);
});
