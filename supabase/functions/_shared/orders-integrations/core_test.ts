import { assert, assertEquals, assertFalse } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  assertCompanyConsistency,
  backoffSeconds,
  classifyError,
  hmacSha256Hex,
  isOutOfOrder,
  maskValue,
  sanitizeErrorMessage,
  sanitizePayload,
  verifyHmacSignature,
} from "./core.ts";
import { PermanentIntegrationError, TransientIntegrationError } from "./types.ts";
import { sandboxAdapter } from "./adapters/sandbox.ts";
import { getAdapter, hasAdapter } from "./registry.ts";

Deno.test("sanitizePayload mascara campos sensíveis", () => {
  const out = sanitizePayload({
    customer: { name: "Maria", cpf: "12345678901", phone: "62999998888" },
    authorization: "Bearer abc.def.ghi",
    total: 1990,
  }) as Record<string, Record<string, string>>;
  assertEquals(out.customer.name, "Maria");
  assertEquals(out.customer.cpf, "***8901");
  assertEquals(out.customer.phone, "***8888");
  assert(!JSON.stringify(out).includes("abc.def.ghi"));
});

Deno.test("sanitizePayload limita profundidade e arrays", () => {
  let deep: unknown = "fim";
  for (let i = 0; i < 12; i++) deep = { nested: deep };
  assert(JSON.stringify(sanitizePayload(deep)).includes("[truncated]"));

  const big = sanitizePayload(Array.from({ length: 250 }, (_, i) => i)) as unknown[];
  assertEquals(big.length, 201);
  assertEquals(big[200], "[+50 itens]");
});

Deno.test("maskValue preserva formato reconhecível", () => {
  assertEquals(maskValue("12345678901"), "***8901");
  assertEquals(maskValue("maria@exemplo.com"), "m***@exemplo.com");
  assertEquals(maskValue("ab"), "***");
});

Deno.test("sanitizeErrorMessage remove url, token e stack", () => {
  const message = sanitizeErrorMessage(
    new Error("falha em https://api.exemplo.com/v1 com Bearer abcdef12345 at file.ts:10:2"),
  );
  assert(message.includes("[url]"));
  assert(message.includes("[token]"));
  assertFalse(message.includes("file.ts"));
});

Deno.test("classifyError separa transitório de definitivo", () => {
  assertEquals(classifyError(new Error("Request timeout")).transient, true);
  assertEquals(classifyError(new Error("fetch failed")).errorClass, "upstream_unavailable");
  assertEquals(classifyError(new Error("payload invalid")).transient, false);
  assertEquals(
    classifyError(new PermanentIntegrationError("company_conflict", "x")).transient,
    false,
  );
  assertEquals(classifyError(new TransientIntegrationError("timeout", "x")).transient, true);
});

Deno.test("backoffSeconds cresce e respeita teto", () => {
  assertEquals(backoffSeconds(0), 5);
  assertEquals(backoffSeconds(1), 10);
  assertEquals(backoffSeconds(4), 80);
  assertEquals(backoffSeconds(20), 3600);
});

Deno.test("verifyHmacSignature aceita apenas assinatura correta", async () => {
  const body = JSON.stringify({ event_id: "e1" });
  const signature = await hmacSha256Hex("segredo", body);
  assert(await verifyHmacSignature({ rawBody: body, secret: "segredo", provided: signature }));
  assert(
    await verifyHmacSignature({
      rawBody: body,
      secret: "segredo",
      provided: `sha256=${signature.toUpperCase()}`,
    }),
  );
  assertFalse(await verifyHmacSignature({ rawBody: body, secret: "outro", provided: signature }));
  assertFalse(await verifyHmacSignature({ rawBody: body, secret: null, provided: signature }));
  assertFalse(await verifyHmacSignature({ rawBody: body, secret: "segredo", provided: null }));
  assertFalse(await verifyHmacSignature({ rawBody: "", secret: "segredo", provided: signature }));
});

Deno.test("isOutOfOrder descarta sequência antiga", () => {
  assert(isOutOfOrder(3, 5));
  assert(isOutOfOrder(5, 5));
  assertFalse(isOutOfOrder(6, 5));
  assertFalse(isOutOfOrder(null, 5));
  assertFalse(isOutOfOrder(2, null));
});

Deno.test("assertCompanyConsistency bloqueia empresa divergente", () => {
  assertCompanyConsistency(null, "empresa-1");
  assertCompanyConsistency("empresa-1", "empresa-1");
  let failed = false;
  try {
    assertCompanyConsistency("empresa-2", "empresa-1");
  } catch (error) {
    failed = error instanceof PermanentIntegrationError;
  }
  assert(failed, "deveria rejeitar empresa vinda do payload");
});

Deno.test("registry expõe apenas o simulador", () => {
  assert(hasAdapter("sandbox"));
  assertFalse(hasAdapter("ifood"));
  let blocked = false;
  try {
    getAdapter("ifood");
  } catch (error) {
    blocked = error instanceof PermanentIntegrationError;
  }
  assert(blocked, "provedor sem adaptador homologado deve falhar");
});

Deno.test("sandbox normaliza pedido criado", () => {
  const event = sandboxAdapter.toCanonical(
    {
      event_id: "evt-1",
      event_type: "order.created",
      order_id: "ext-1",
      sequence: 2,
      mode: "delivery",
      customer_name: "Ana",
      items: [{ name: "Pizza", quantity: 2, unit_price_cents: 4500 }],
    },
    {},
  );
  assertEquals(event.type, "order.created");
  assertEquals(event.externalOrderId, "ext-1");
  assertEquals(event.items?.[0].unitPriceCents, 4500);
  assertEquals(event.delivery?.mode, "delivery");
  assertEquals(event.isTest, true);
});

Deno.test("sandbox rejeita payload inválido", () => {
  const cases: unknown[] = [
    { event_id: "e", event_type: "order.created", items: [] },
    { event_id: "e", event_type: "desconhecido" },
    { event_id: "e", event_type: "order.created", items: [{ name: "X", quantity: 0, unit_price_cents: 10 }] },
    { event_id: "e", event_type: "order.created", items: [{ name: "X", quantity: 1, unit_price_cents: 10.5 }] },
  ];
  for (const raw of cases) {
    let failed = false;
    try {
      sandboxAdapter.toCanonical(raw, {});
    } catch (error) {
      failed = error instanceof PermanentIntegrationError;
    }
    assert(failed, `payload deveria ser rejeitado: ${JSON.stringify(raw)}`);
  }
});

Deno.test("sandbox extrai id do evento do corpo ou header", () => {
  assertEquals(sandboxAdapter.externalEventId({ event_id: " evt-9 " }, {}), "evt-9");
  assertEquals(sandboxAdapter.externalEventId({}, { "x-event-id": "hdr-1" }), "hdr-1");
  assertEquals(sandboxAdapter.externalEventId({}, {}), null);
});

Deno.test("sandbox send simula falhas para exercitar a fila", async () => {
  const ctx = {
    integrationId: "i",
    companyId: "c",
    unitId: "u",
    provider: "sandbox" as const,
    config: {},
    secret: null,
  };
  const ok = await sandboxAdapter.send({ operation: "order.accept", payload: {} }, ctx);
  assert(ok.externalRef?.startsWith("sandbox-order.accept"));

  let transient = false;
  try {
    await sandboxAdapter.send({ operation: "order.accept", payload: { simulate: "transient" } }, ctx);
  } catch (error) {
    transient = error instanceof TransientIntegrationError;
  }
  assert(transient);

  let permanent = false;
  try {
    await sandboxAdapter.send({ operation: "order.accept", payload: { simulate: "permanent" } }, ctx);
  } catch (error) {
    permanent = error instanceof PermanentIntegrationError;
  }
  assert(permanent);
});
