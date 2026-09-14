import { assert, assertEquals, assertNotEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { gerarCodigo, hashCodigo, linkDeAcesso } from "./portal-access.ts";

Deno.test("código não usa caracteres ambíguos e não repete", () => {
  const a = gerarCodigo();
  const b = gerarCodigo();
  assertEquals(a.length, 24);
  assert(/^[A-HJ-NP-Z2-9]+$/.test(a), a);
  assertNotEquals(a, b);
});

Deno.test("hash é determinístico por usuário e não contém o código", async () => {
  const h1 = await hashCodigo("u1", "ABCD2345");
  const h2 = await hashCodigo("u1", "ABCD2345");
  const h3 = await hashCodigo("u2", "ABCD2345");
  assertEquals(h1, h2);
  assertNotEquals(h1, h3);
  assertEquals(h1.length, 64);
  assert(!h1.includes("ABCD2345"));
});

Deno.test("link só aceita origens do produto", () => {
  assertEquals(
    linkDeAcesso("https://aveto360.com", "activation", "AB"),
    "https://aveto360.com/ativar-acesso?c=AB",
  );
  assertEquals(
    linkDeAcesso("https://evil.example.com", "reset", "AB"),
    "https://aveto360.com/redefinir-acesso?c=AB",
  );
});
