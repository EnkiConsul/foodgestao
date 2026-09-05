import { describe, it, expect, vi, afterEach } from "vitest";
import {
  jsonError,
  jsonResponse,
  strictCorsHeaders,
} from "../../../supabase/functions/_shared/http.ts";

const req = (origin?: string) =>
  new Request("https://example.test/fn", {
    method: "POST",
    headers: origin ? { origin } : {},
  });

afterEach(() => vi.restoreAllMocks());

describe("strictCorsHeaders", () => {
  it("libera origens do produto", () => {
    for (const origin of [
      "https://aveto360.com",
      "https://www.aveto360.com",
      "https://id-preview--abc.lovable.app",
      "http://localhost:8080",
    ]) {
      const h = strictCorsHeaders(req(origin));
      expect(h["Access-Control-Allow-Origin"]).toBe(origin);
      expect(h["Vary"]).toBe("Origin");
    }
  });

  it("não libera origem de terceiros nem origem ausente", () => {
    for (const origin of [
      "https://evil.example.com",
      "https://aveto360.com.evil.com",
      "not-a-url",
      undefined,
    ]) {
      const h = strictCorsHeaders(req(origin));
      expect(h["Access-Control-Allow-Origin"]).toBeUndefined();
      expect(h["Access-Control-Allow-Credentials"]).toBeUndefined();
    }
  });
});

describe("jsonError", () => {
  it("usa status e mensagem genérica por tipo", async () => {
    const cases: Array<[Parameters<typeof jsonError>[1], number]> = [
      ["invalid_input", 400],
      ["unauthorized", 401],
      ["forbidden", 403],
      ["not_found", 404],
      ["conflict", 409],
      ["rate_limited", 429],
      ["internal", 500],
    ];
    for (const [kind, status] of cases) {
      const res = jsonError(req("https://aveto360.com"), kind);
      expect(res.status).toBe(status);
      const body = await res.json();
      expect(typeof body.error).toBe("string");
      expect(body.error.length).toBeGreaterThan(0);
    }
  });

  it("nunca devolve o detalhe do erro ao cliente, só registra em log", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const detail = 'permission denied for table "transactions"';
    const res = jsonError(req(), "internal", new Error(detail));
    const raw = await res.text();
    expect(raw).not.toContain("permission denied");
    expect(raw).not.toContain("transactions");
    expect(spy).toHaveBeenCalledOnce();
    expect(String(spy.mock.calls[0][0])).toContain(detail);
  });

  it("permite campos extras controlados", async () => {
    const res = jsonError(req(), "rate_limited", undefined, { retry_after: 60 });
    expect(await res.json()).toMatchObject({ retry_after: 60 });
  });
});

describe("jsonResponse", () => {
  it("sempre devolve JSON com os cabeçalhos restritos", async () => {
    const res = jsonResponse(req("https://aveto360.com"), 200, { ok: true });
    expect(res.headers.get("Content-Type")).toBe("application/json");
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://aveto360.com",
    );
    expect(await res.json()).toEqual({ ok: true });
  });
});
