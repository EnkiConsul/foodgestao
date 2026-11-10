import { assertEquals } from "jsr:@std/assert@1";
import { precoExcedenteColaborador } from "./billing-excedente-preco.ts";

Deno.test("Enterprise cobra R$ 10,00 por colaborador acima da base", () => {
  assertEquals(precoExcedenteColaborador({ price_per_collaborator_cents: 1000, min_collaborators: 19 }, 1990), 1000);
});

Deno.test("Essencial/Gestão/Multiempresa cobram o adicional de R$ 19,90", () => {
  assertEquals(precoExcedenteColaborador({ max_collaborators: 18 }, 1990), 1990);
});

Deno.test("sem preço configurado não cobra", () => {
  assertEquals(precoExcedenteColaborador(null, null), 0);
});
