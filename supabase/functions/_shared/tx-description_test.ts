// Deno tests para o enriquecimento de descrições do Open Finance.
// Run: deno test supabase/functions/_shared/tx-description_test.ts

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildDescription,
  counterpartyName,
  pickSourceDescription,
  completeTruncatedName,
  externalCounterpartyName,
} from "./tx-description.ts";

const OWN = { ownDocuments: ["58.241.366/0001-32"], ownNames: ["ENKI CONSULTORIA LTDA"] };

Deno.test("completa nome cortado pelo banco", () => {
  const tx = {
    description: "PIX ENVIADO   BYTEDANCE BRASIL TECNOLOG",
    amount: -47.27,
    paymentData: {
      payer: { name: null, documentNumber: { type: "CNPJ", value: "58.241.366/0001-32" } },
      receiver: {
        name: "BYTEDANCE BRASIL TECNOLOGIA LTDA.",
        documentNumber: { type: "CNPJ", value: "21.649.378/0001-24" },
      },
      paymentMethod: "PIX",
    },
    merchant: { businessName: "BYTEDANCE BRASIL TECNOLOGIA LTDA.", cnpj: "21649378000124" },
  };
  assertEquals(
    buildDescription(tx, OWN),
    "PIX ENVIADO BYTEDANCE BRASIL TECNOLOGIA LTDA.",
  );
});

Deno.test("descrição completa não é alterada", () => {
  const tx = {
    description: "PIX ENVIADO   SANEAGO",
    amount: -42.2,
    paymentData: {
      receiver: { name: "SANEAMENTO DE GOIAS S/A", documentNumber: { value: "01.616.929/0001-02" } },
      paymentMethod: "PIX",
    },
    merchant: { businessName: "SANEAMENTO DE GOIAS S/A" },
  };
  assertEquals(buildDescription(tx, OWN), "PIX ENVIADO SANEAGO");
});

Deno.test("rótulo genérico é enriquecido com a contraparte", () => {
  const tx = {
    description: "TRANSF ENVIADA PIX",
    amount: -79.8,
    paymentData: {
      receiver: {
        name: "LRR DISTRIBUIDORA DE MATERIAL HOSPITALAR LTDA",
        documentNumber: { value: "12.345.678/0001-99" },
      },
      paymentMethod: "PIX",
    },
  };
  assertEquals(
    buildDescription(tx, OWN),
    "Pix enviado para LRR DISTRIBUIDORA DE MATERIAL HOSPITALAR LTDA",
  );
});

Deno.test("merchant igual à própria empresa é descartado em créditos", () => {
  const tx = {
    description: "NAGASUBIAS CORPORATE LTDA",
    amount: 1200,
    paymentData: {
      payer: {
        name: "NAGASUBIAS CORPORATE LTDA",
        documentNumber: { value: "66.520.302/0001-07" },
      },
      receiver: null,
      paymentMethod: "PIX",
    },
    merchant: { businessName: "ENKI CONSULTORIA LTDA", cnpj: "58241366000132" },
  };
  assertEquals(externalCounterpartyName(tx, OWN), "NAGASUBIAS CORPORATE LTDA");
  assertEquals(buildDescription(tx, OWN), "NAGASUBIAS CORPORATE LTDA");
});

Deno.test("sem contraparte: preserva descrição do banco (tarifa)", () => {
  const tx = {
    description: "TARIFA AVULSA ENVIO PIX   21/07/2026",
    amount: -2.94,
    paymentData: {
      payer: { name: null, documentNumber: { value: "58.241.366/0001-32" } },
      receiver: null,
      paymentMethod: "OTHER",
    },
    merchant: null,
  };
  assertEquals(externalCounterpartyName(tx, OWN), null);
  assertEquals(buildDescription(tx, OWN), "TARIFA AVULSA ENVIO PIX 21/07/2026");
});

Deno.test("completeTruncatedName: casos de borda", () => {
  assertEquals(completeTruncatedName("PIX", null), "PIX");
  assertEquals(completeTruncatedName("PAGAMENTO DE BOLETO   FROHLICH INVESTIMENTOS E", "FROHLICH INVESTIMENTOS E PARTICIPACOES LTDA"), "PAGAMENTO DE BOLETO   FROHLICH INVESTIMENTOS E PARTICIPACOES LTDA");
  // Sufixo curto não é completado (evita falso positivo).
  assertEquals(completeTruncatedName("COMPRA AB", "ABCDEF COMERCIO LTDA"), "COMPRA AB");
  // Nome já completo na descrição.
  assertEquals(completeTruncatedName("PIX PARA ACME LTDA", "ACME LTDA"), "PIX PARA ACME LTDA");
});

Deno.test("sanitiza controle, espaços e placeholders", () => {
  assertEquals(
    buildDescription({ description: "  PIX\tRECEBIDO   ACME\u0000 LTDA  ", amount: 10 }, OWN),
    "PIX RECEBIDO ACME LTDA",
  );
  assertEquals(
    buildDescription({ description: "  ---  ", descriptionRaw: "COMPRA MERCADO XYZ", amount: -10 }, OWN),
    "COMPRA MERCADO XYZ",
  );
});

Deno.test("fallback para descriptionRaw quando canônico é genérico/vazio", () => {
  assertEquals(pickSourceDescription({ description: null, descriptionRaw: "TARIFA" }), "TARIFA");
  assertEquals(pickSourceDescription({ description: "PIX ENVIADO", descriptionRaw: "PIX ENVIADO PADARIA SOL" }), "PIX ENVIADO PADARIA SOL");
  assertEquals(pickSourceDescription({ description: "NETFLIX", descriptionRaw: "PIX" }), "NETFLIX");
  assertEquals(pickSourceDescription({ description: "null", descriptionRaw: "N/A" }), "");
  assertEquals(pickSourceDescription({ description: "COMPRA MERC", descriptionRaw: "COMPRA MERCADO SOL" }), "COMPRA MERCADO SOL");
});

Deno.test("nunca retorna vazio", () => {
  assertEquals(buildDescription({ description: "", descriptionRaw: "", amount: 0 }), "Transferência recebido de contraparte não identificada");
  assertEquals(buildDescription({ description: "?????", amount: 0 }), "Transferência recebido de contraparte não identificada");
});

Deno.test("cartão: texto do banco é preservado sem reescrita", () => {
  const tx = {
    description: "CREDITO_A_VISTA",
    descriptionRaw: "CREDITO_A_VISTA",
    amount: 34.9,
    merchant: null,
    paymentData: null,
    category: "Digital services",
    creditCardMetadata: { cardNumber: "0038" },
  };
  assertEquals(buildDescription(tx, OWN), "CREDITO_A_VISTA");
});


Deno.test("cartão: estabelecimento informado é preservado", () => {
  const tx = {
    description: "PONTO DA CARNE   GOIANIA   BR",
    amount: 120,
    merchant: null,
    paymentData: null,
    creditCardMetadata: { cardNumber: "0038" },
  };
  assertEquals(buildDescription(tx, OWN), "PONTO DA CARNE GOIANIA BR");
});

Deno.test("cartão: prioriza descriptionRaw e extrai estabelecimento da coluna", () => {
  const tx = {
    description: "Descrição antiga",
    descriptionRaw: "PONTO DA CARNE           GOIANIA      BR",
    amount: 120,
    merchant: null,
    paymentData: null,
    creditCardMetadata: { cardNumber: "0038" },
  };
  assertEquals(buildDescription(tx, OWN), "PONTO DA CARNE GOIANIA BR");
  assertEquals(counterpartyName(tx, OWN), "PONTO DA CARNE");
});

Deno.test("cartão: não cria contraparte para código ou pagamento da fatura", () => {
  assertEquals(counterpartyName({
    descriptionRaw: "CREDITO_A_VISTA",
    creditCardMetadata: { cardNumber: "0038" },
  }, OWN), null);
  assertEquals(counterpartyName({
    descriptionRaw: "Pagamento Fatura",
    category: "Credit card payment",
    creditCardMetadata: { cardNumber: "0038" },
  }, OWN), null);
});
