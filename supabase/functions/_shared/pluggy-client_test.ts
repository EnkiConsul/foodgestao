import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { safePluggyError } from "./pluggy-client.ts";

Deno.test("safePluggyError: retorna fallback com status http quando vazio", () => {
  assertEquals(safePluggyError(null, 502), "http_502");
  assertEquals(safePluggyError("", 400), "http_400");
  assertEquals(safePluggyError(undefined), "pluggy_error");
});

Deno.test("safePluggyError: nunca vaza credenciais", () => {
  assertEquals(safePluggyError("invalid clientSecret provided", 401), "http_401");
  assertEquals(safePluggyError({ message: "Bearer abc123 rejected" }, 401), "http_401");
  assertEquals(safePluggyError("missing API key", 403), "http_403");
});

Deno.test("safePluggyError: trunca mensagens longas", () => {
  const long = "x".repeat(200);
  assertEquals(safePluggyError(long, 500), "http_500");
});

Deno.test("safePluggyError: mantém mensagens curtas e seguras", () => {
  assertEquals(safePluggyError("Item not found", 404), "Item not found");
  assertEquals(safePluggyError({ message: "  ITEM_LOGIN_ERROR  " }), "ITEM_LOGIN_ERROR");
});
