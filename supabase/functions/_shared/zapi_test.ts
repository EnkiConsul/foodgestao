// Deno tests for the Z-API helper.
// Run with: deno test --allow-net --allow-env supabase/functions/_shared/zapi_test.ts

import {
  assertEquals,
  assertStrictEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  checkZapiStatus,
  normalizeBRPhone,
  sendZapiText,
  timingSafeEqualHex,
} from "./zapi.ts";

// ---------- Env setup: required so the helper doesn't short-circuit ----------
Deno.env.set("Z_API_INSTANCE_ID", "test-instance");
Deno.env.set("Z_API_TOKEN", "test-token");
Deno.env.set("Z_API_CLIENT_TOKEN", "test-client-token");

// ---------- fetch stub utility ----------
type StubResponse = {
  status: number;
  body: string;
  contentType?: string;
};

function installFetchStub(responses: StubResponse[]) {
  const original = globalThis.fetch;
  const calls: { url: string; init?: RequestInit }[] = [];
  let i = 0;
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    const r = responses[Math.min(i, responses.length - 1)];
    i++;
    return Promise.resolve(
      new Response(r.body, {
        status: r.status,
        headers: { "content-type": r.contentType ?? "application/json" },
      }),
    );
  }) as typeof fetch;
  return {
    calls,
    restore: () => {
      globalThis.fetch = original;
    },
    get count() {
      return i;
    },
  };
}

// ============================================================================
// normalizeBRPhone
// ============================================================================

Deno.test("normalizeBRPhone: null/empty/garbage returns null", () => {
  assertStrictEquals(normalizeBRPhone(null), null);
  assertStrictEquals(normalizeBRPhone(undefined), null);
  assertStrictEquals(normalizeBRPhone(""), null);
  assertStrictEquals(normalizeBRPhone("abc"), null);
});

Deno.test("normalizeBRPhone: 11-digit BR mobile with valid DDD gets 55 prepended", () => {
  assertEquals(normalizeBRPhone("11987654321"), "5511987654321");
  assertEquals(normalizeBRPhone("62991250757"), "5562991250757");
  assertEquals(normalizeBRPhone("(62) 99125-0757"), "5562991250757");
});

Deno.test("normalizeBRPhone: 10-digit BR landline with valid DDD gets 55 prepended", () => {
  assertEquals(normalizeBRPhone("1133334444"), "551133334444");
});

Deno.test("normalizeBRPhone: 11-digit with invalid DDD is rejected as BR local", () => {
  // DDD 10 is invalid — falls through and, being 11 digits, returns null
  assertStrictEquals(normalizeBRPhone("10987654321"), null);
});

Deno.test("normalizeBRPhone: already has 55 + valid DDD is preserved", () => {
  assertEquals(normalizeBRPhone("5511987654321"), "5511987654321");
  assertEquals(normalizeBRPhone("+55 (62) 99125-0757"), "5562991250757");
});

Deno.test("normalizeBRPhone: 55 + invalid DDD is not accepted as BR", () => {
  // 55 + DDD 00 is invalid — must NOT be returned as-is via the BR branch.
  // Length 13 falls into the "foreign" branch (12-15) and is returned as-is;
  // this documents current behaviour: foreign numbers are pass-through.
  assertEquals(normalizeBRPhone("5500987654321"), "5500987654321");
});

Deno.test("normalizeBRPhone: leading zeros are stripped", () => {
  assertEquals(normalizeBRPhone("00062991250757"), "5562991250757");
});

Deno.test("normalizeBRPhone: foreign number (14 digits) is passed through", () => {
  // e.g. Portugal mobile 351 912 345 678 with extra digit
  assertEquals(normalizeBRPhone("35191234567890"), "35191234567890");
});

Deno.test("normalizeBRPhone: too short returns null", () => {
  assertStrictEquals(normalizeBRPhone("123456789"), null); // 9 digits
});

Deno.test("normalizeBRPhone: too long returns null", () => {
  assertStrictEquals(normalizeBRPhone("1234567890123456"), null); // 16 digits
});

// ============================================================================
// sendZapiText — retry / backoff behaviour
// ============================================================================

Deno.test("sendZapiText: succeeds on first attempt (no retry)", async () => {
  const stub = installFetchStub([
    { status: 200, body: JSON.stringify({ messageId: "abc123" }) },
  ]);
  try {
    const res = await sendZapiText("5562991250757", "hi");
    assertEquals(res.ok, true);
    assertEquals(res.messageId, "abc123");
    assertEquals(stub.count, 1);
    // Sanity: URL and Client-Token header are correct
    assertEquals(
      stub.calls[0].url,
      "https://api.z-api.io/instances/test-instance/token/test-token/send-text",
    );
    const headers = new Headers(stub.calls[0].init?.headers);
    assertEquals(headers.get("client-token"), "test-client-token");
    assertEquals(headers.get("content-type"), "application/json");
  } finally {
    stub.restore();
  }
});

Deno.test("sendZapiText: retries on 5xx then succeeds", async () => {
  const stub = installFetchStub([
    { status: 502, body: JSON.stringify({ error: "bad_gateway" }) },
    { status: 200, body: JSON.stringify({ zaapId: "z-999" }) },
  ]);
  try {
    const res = await sendZapiText("5562991250757", "hi");
    assertEquals(res.ok, true);
    assertEquals(res.messageId, "z-999");
    assertEquals(stub.count, 2);
  } finally {
    stub.restore();
  }
});

Deno.test("sendZapiText: does NOT retry on 4xx (permanent)", async () => {
  const stub = installFetchStub([
    { status: 400, body: JSON.stringify({ error: "invalid_phone" }) },
    { status: 200, body: JSON.stringify({ messageId: "should-not-be-used" }) },
  ]);
  try {
    const res = await sendZapiText("5562991250757", "hi");
    assertEquals(res.ok, false);
    assertEquals(res.error, "invalid_phone");
    assertEquals(res.httpStatus, 400);
    assertStrictEquals(stub.count, 1);
  } finally {
    stub.restore();
  }
});

Deno.test("sendZapiText: sanitizes credential-bearing Z-API 403 errors", async () => {
  const stub = installFetchStub([
    { status: 403, body: JSON.stringify({ error: "Client-Token secret-value not allowed" }) },
    { status: 200, body: JSON.stringify({ messageId: "should-not-be-used" }) },
  ]);
  try {
    const res = await sendZapiText("5562991250757", "hi");
    assertEquals(res.ok, false);
    assertEquals(res.error, "http_403");
    assertEquals(res.httpStatus, 403);
    assertStrictEquals(stub.count, 1);
  } finally {
    stub.restore();
  }
});

Deno.test("sendZapiText: retries up to 3 times on persistent 5xx then gives up", async () => {
  const stub = installFetchStub([
    { status: 500, body: "boom" },
    { status: 503, body: "still boom" },
    { status: 502, body: "still still boom" },
    { status: 200, body: JSON.stringify({ messageId: "should-not-be-used" }) },
  ]);
  try {
    const res = await sendZapiText("5562991250757", "hi");
    assertEquals(res.ok, false);
    assertEquals(res.httpStatus, 502);
    assertStrictEquals(stub.count, 3);
  } finally {
    stub.restore();
  }
});

Deno.test("sendZapiText: retries on network_error (fetch throw)", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (() => {
    calls++;
    if (calls < 2) return Promise.reject(new Error("connection reset"));
    return Promise.resolve(
      new Response(JSON.stringify({ messageId: "ok-after-net-err" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
  }) as typeof fetch;
  try {
    const res = await sendZapiText("5562991250757", "hi");
    assertEquals(res.ok, true);
    assertEquals(res.messageId, "ok-after-net-err");
    assertEquals(calls, 2);
  } finally {
    globalThis.fetch = original;
  }
});

// ============================================================================
// sendZapiText — non-JSON response parsing
// ============================================================================

Deno.test("sendZapiText: non-JSON error response is surfaced as http_<code>", async () => {
  const stub = installFetchStub([
    { status: 503, body: "<html>maintenance</html>", contentType: "text/html" },
    { status: 503, body: "<html>maintenance</html>", contentType: "text/html" },
    { status: 503, body: "<html>maintenance</html>", contentType: "text/html" },
  ]);
  try {
    const res = await sendZapiText("5562991250757", "hi");
    assertEquals(res.ok, false);
    assertEquals(res.error, "http_503");
    assertEquals(res.httpStatus, 503);
  } finally {
    stub.restore();
  }
});

Deno.test("sendZapiText: non-JSON 200 response yields ok with no messageId", async () => {
  const stub = installFetchStub([
    { status: 200, body: "OK", contentType: "text/plain" },
  ]);
  try {
    const res = await sendZapiText("5562991250757", "hi");
    assertEquals(res.ok, true);
    assertStrictEquals(res.messageId, undefined);
  } finally {
    stub.restore();
  }
});

// ============================================================================
// checkZapiStatus
// ============================================================================

Deno.test("checkZapiStatus: reads connected status", async () => {
  const stub = installFetchStub([
    { status: 200, body: JSON.stringify({ connected: true }) },
  ]);
  try {
    const res = await checkZapiStatus();
    assertEquals(res.connected, true);
    assertEquals(stub.calls[0].url, "https://api.z-api.io/instances/test-instance/token/test-token/status");
    const headers = new Headers(stub.calls[0].init?.headers);
    assertEquals(headers.get("client-token"), "test-client-token");
  } finally {
    stub.restore();
  }
});

Deno.test("checkZapiStatus: surfaces non-2xx as http status without body leakage", async () => {
  const stub = installFetchStub([
    { status: 403, body: JSON.stringify({ error: "Client-Token secret-value not allowed" }) },
  ]);
  try {
    const res = await checkZapiStatus();
    assertEquals(res.connected, false);
    assertEquals(res.error, "http_403");
    assertEquals(res.httpStatus, 403);
  } finally {
    stub.restore();
  }
});

// ============================================================================
// timingSafeEqualHex (sanity)
// ============================================================================

Deno.test("timingSafeEqualHex: equal / unequal / length mismatch", () => {
  assertEquals(timingSafeEqualHex("abcd", "abcd"), true);
  assertEquals(timingSafeEqualHex("abcd", "abce"), false);
  assertEquals(timingSafeEqualHex("abcd", "abcde"), false);
});
