import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { resumoQuitacao, valorPorExtenso } from "./quitacao.ts";

Deno.test("valor por extenso dos casos do dia a dia", () => {
  assertEquals(valorPorExtenso(100), "um real");
  assertEquals(valorPorExtenso(150), "um real e cinquenta centavos");
  assertEquals(valorPorExtenso(30000), "trezentos reais");
  assertEquals(valorPorExtenso(100000), "mil reais");
  assertEquals(valorPorExtenso(123456), "mil, duzentos e trinta e quatro reais e cinquenta e seis centavos");
  assertEquals(valorPorExtenso(0), "zero real");
});

Deno.test("resumo da quitação", () => {
  assertEquals(
    resumoQuitacao({ modalidade: "especie", valor_especie_cents: 30000 }),
    "Dinheiro (Espécie) · R$ 300,00 em dinheiro",
  );
  assertEquals(resumoQuitacao({ modalidade: null }), "Forma de pagamento não informada");
});
