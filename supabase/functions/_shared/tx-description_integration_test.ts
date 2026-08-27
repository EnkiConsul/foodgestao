/**
 * Testes de integração com payloads reais (anonimizados) da Pluggy.
 *
 * Objetivo: garantir que a descrição normalizada SEMPRE sai do campo correto
 * (`description` canônico) e cai para `descriptionRaw` apenas quando o
 * canônico está ausente, é placeholder, é genérico ou vem truncado.
 */
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildDescription,
  pickSourceDescription,
  sanitizeDescription,
  MAX_DESCRIPTION_LENGTH,
} from "./tx-description.ts";

const OWN = {
  ownDocuments: ["58.241.366/0001-32"],
  ownNames: ["ENKI CONSULTORIA LTDA", "ENKI"],
};

/** Payloads no formato retornado por GET /transactions da Pluggy. */
const PAYLOADS = {
  // Itaú — PIX enviado, descrição canônica truncada em 30 chars.
  pixEnviadoTruncado: {
    id: "8f2b1d9c-0001-4a11-9a2e-000000000001",
    description: "PIX TRANSF BYTEDANCE BRASIL TE",
    descriptionRaw: "PIX TRANSFERENCIA ENVIADA",
    amount: -47.27,
    currencyCode: "BRL",
    date: "2026-07-21T00:00:00.000Z",
    type: "DEBIT",
    paymentData: {
      payer: {
        name: "ENKI CONSULTORIA LTDA",
        documentNumber: { type: "CNPJ", value: "58.241.366/0001-32" },
      },
      receiver: {
        name: "BYTEDANCE BRASIL TECNOLOGIA LTDA.",
        documentNumber: { type: "CNPJ", value: "21.649.378/0001-24" },
      },
      paymentMethod: "PIX",
    },
    merchant: null,
  },

  // Nubank — PIX recebido com rótulo 100% genérico no canônico.
  pixRecebidoGenerico: {
    id: "8f2b1d9c-0002-4a11-9a2e-000000000002",
    description: "Transferência recebida",
    descriptionRaw: null,
    amount: 1200,
    currencyCode: "BRL",
    date: "2026-07-22T00:00:00.000Z",
    type: "CREDIT",
    paymentData: {
      payer: {
        name: "NAGASUBIAS CORPORATE LTDA",
        documentNumber: { type: "CNPJ", value: "66.520.302/0001-07" },
      },
      receiver: {
        name: "ENKI CONSULTORIA LTDA",
        documentNumber: { type: "CNPJ", value: "58241366000132" },
      },
      paymentMethod: "PIX",
    },
    // Pluggy às vezes devolve o próprio titular como merchant em créditos.
    merchant: { businessName: "ENKI CONSULTORIA LTDA", cnpj: "58241366000132" },
  },

  // Santander — canônico vazio, só o raw traz conteúdo.
  canonicoVazio: {
    id: "8f2b1d9c-0003-4a11-9a2e-000000000003",
    description: "",
    descriptionRaw: "PAGAMENTO BOLETO SANEAGO 07/2026",
    amount: -142.2,
    currencyCode: "BRL",
    date: "2026-07-10T00:00:00.000Z",
    type: "DEBIT",
    paymentData: null,
    merchant: null,
  },

  // Bradesco — canônico é placeholder ("-"), raw é o rótulo real.
  canonicoPlaceholder: {
    id: "8f2b1d9c-0004-4a11-9a2e-000000000004",
    description: " - ",
    descriptionRaw: "TARIFA MENSALIDADE PACOTE SERVICOS",
    amount: -49.9,
    currencyCode: "BRL",
    date: "2026-07-05T00:00:00.000Z",
    type: "DEBIT",
    paymentData: { payer: null, receiver: null, paymentMethod: "OTHER" },
    merchant: null,
  },

  // Cartão de crédito — canônico completo, merchant idem: não deve mudar.
  compraCartao: {
    id: "8f2b1d9c-0005-4a11-9a2e-000000000005",
    description: "IFOOD CLUB",
    descriptionRaw: "IFOOD.COM AGENCIA DE REST",
    amount: -34.9,
    currencyCode: "BRL",
    date: "2026-07-18T00:00:00.000Z",
    type: "DEBIT",
    paymentData: null,
    merchant: {
      name: "iFood",
      businessName: "IFOOD.COM AGENCIA DE RESTAURANTES ONLINE S.A.",
      cnpj: "14.380.200/0001-21",
    },
  },

  // Sicoob — canônico é só o nome do banco (não informa o estabelecimento).
  rotuloBanco: {
    id: "8f2b1d9c-0006-4a11-9a2e-000000000006",
    description: "BANCO SICOOB S.A.",
    descriptionRaw: "BANCO SICOOB S.A.",
    amount: -220,
    currencyCode: "BRL",
    date: "2026-07-19T00:00:00.000Z",
    type: "DEBIT",
    paymentData: {
      payer: {
        name: "ENKI CONSULTORIA LTDA",
        documentNumber: { type: "CNPJ", value: "58241366000132" },
      },
      receiver: {
        name: "DISTRIBUIDORA ALIMENTOS SOL LTDA",
        documentNumber: { type: "CNPJ", value: "12.345.678/0001-99" },
      },
      paymentMethod: "PIX",
    },
    merchant: null,
  },

  // BB — nenhum lado identificado, apenas documento da contraparte.
  semNomeSoDocumento: {
    id: "8f2b1d9c-0007-4a11-9a2e-000000000007",
    description: "TED",
    descriptionRaw: "TED",
    amount: -980,
    currencyCode: "BRL",
    date: "2026-07-20T00:00:00.000Z",
    type: "DEBIT",
    paymentData: {
      payer: null,
      receiver: {
        name: null,
        documentNumber: { type: "CPF", value: "123.456.789-09" },
        routingNumber: "001",
        accountNumber: "12345-6",
      },
      paymentMethod: "TED",
    },
    merchant: null,
  },

  // Inter — canônico com ruído de controle/whitespace duplicado.
  canonicoComRuido: {
    id: "8f2b1d9c-0008-4a11-9a2e-000000000008",
    description: "PIX\tRECEBIDO\u0000   PADARIA  SOL LTDA  ",
    descriptionRaw: "PIX RECEBIDO",
    amount: 88.5,
    currencyCode: "BRL",
    date: "2026-07-23T00:00:00.000Z",
    type: "CREDIT",
    paymentData: null,
    merchant: null,
  },
};

Deno.test("integração: canônico truncado é completado (não vira o raw genérico)", () => {
  const t = PAYLOADS.pixEnviadoTruncado;
  // A fonte segue sendo o campo canônico, nunca o raw genérico.
  assertEquals(pickSourceDescription(t), "PIX TRANSF BYTEDANCE BRASIL TE");
  assertEquals(
    buildDescription(t, OWN),
    "PIX TRANSF BYTEDANCE BRASIL TECNOLOGIA LTDA.",
  );
});

Deno.test("integração: canônico genérico é enriquecido com a contraparte externa", () => {
  const t = PAYLOADS.pixRecebidoGenerico;
  const out = buildDescription(t, OWN);
  assertEquals(out, "Pix recebido de NAGASUBIAS CORPORATE LTDA");
  // Nunca devolve o próprio titular como contraparte.
  assert(!out.includes("ENKI"));
});

Deno.test("integração: fallback para descriptionRaw quando o canônico está vazio", () => {
  const t = PAYLOADS.canonicoVazio;
  assertEquals(pickSourceDescription(t), "PAGAMENTO BOLETO SANEAGO 07/2026");
  assertEquals(buildDescription(t, OWN), "PAGAMENTO BOLETO SANEAGO 07/2026");
});

Deno.test("integração: fallback para descriptionRaw quando o canônico é placeholder", () => {
  const t = PAYLOADS.canonicoPlaceholder;
  assertEquals(sanitizeDescription(t.description), "");
  assertEquals(pickSourceDescription(t), "TARIFA MENSALIDADE PACOTE SERVICOS");
  assertEquals(buildDescription(t, OWN), "TARIFA MENSALIDADE PACOTE SERVICOS");
});

Deno.test("integração: canônico válido tem prioridade sobre descriptionRaw e merchant", () => {
  const t = PAYLOADS.compraCartao;
  assertEquals(pickSourceDescription(t), "IFOOD CLUB");
  assertEquals(buildDescription(t, OWN), "IFOOD CLUB");
});

Deno.test("integração: rótulo de banco é substituído pelo estabelecimento real", () => {
  const t = PAYLOADS.rotuloBanco;
  assertEquals(buildDescription(t, OWN), "DISTRIBUIDORA ALIMENTOS SOL LTDA");
});

Deno.test("integração: sem nome, usa documento mascarado da contraparte", () => {
  const t = PAYLOADS.semNomeSoDocumento;
  assertEquals(buildDescription(t, OWN), "TED enviado para CPF ***.456.789-**");
});

Deno.test("integração: ruído de controle e espaços é normalizado", () => {
  const t = PAYLOADS.canonicoComRuido;
  assertEquals(buildDescription(t, OWN), "PIX RECEBIDO PADARIA SOL LTDA");
});

Deno.test("integração: invariantes em todos os payloads reais", () => {
  for (const [key, t] of Object.entries(PAYLOADS)) {
    const out = buildDescription(t as any, OWN);
    assert(out.length > 0, `${key}: descrição vazia`);
    assert(out.length <= MAX_DESCRIPTION_LENGTH, `${key}: descrição longa demais`);
    assert(out === out.trim(), `${key}: espaços nas bordas`);
    assert(!/\s{2,}/.test(out), `${key}: espaços duplicados`);
    assert(
      !out.split('').some((ch) => ch.charCodeAt(0) <= 0x1f),
      `${key}: caractere de controle`,
    );
  }
});
