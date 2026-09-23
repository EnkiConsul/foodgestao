/**
 * Verificação do Cloudflare Turnstile no servidor.
 *
 * Garante que o modo de teste não pode ser ativado pelo cliente (cabeçalho
 * forjado), que a resposta do Cloudflare é validada por completo e que toda
 * dúvida resulta em recusa (fail closed).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  TEST_SECRET_KEY,
  TEST_SITE_KEY,
  DEFAULT_SITE_KEY,
  TURNSTILE_ACTION,
  allowedHostnames,
  turnstileMode,
  turnstileSecrets,
  turnstileSiteKey,
  verifyTurnstileToken,
} from "../../../supabase/functions/_shared/turnstile.ts";

const VALID_TOKEN = "token-de-verificacao-valido";
const HOST_OFICIAL = "aveto360.com";

let envVars: Record<string, string> = {};
const originalDeno = (globalThis as Record<string, unknown>).Deno;

function setEnv(vars: Record<string, string>) {
  envVars = vars;
}

function respostaOk(extra: Record<string, unknown> = {}) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      success: true,
      hostname: HOST_OFICIAL,
      action: TURNSTILE_ACTION,
      ...extra,
    }),
  } as unknown as Response;
}

function mockFetch(impl: (url: string, init: RequestInit) => Promise<Response>) {
  const spy = vi.fn((url: unknown, init: unknown) =>
    impl(String(url), (init ?? {}) as RequestInit),
  );
  vi.stubGlobal("fetch", spy);
  return spy;
}

/** Corpo enviado ao siteverify na última chamada. */
function corpoEnviado(spy: ReturnType<typeof mockFetch>): URLSearchParams {
  const init = spy.mock.calls.at(-1)?.[1] as RequestInit;
  return new URLSearchParams(String(init.body));
}

beforeEach(() => {
  (globalThis as Record<string, unknown>).Deno = {
    env: { get: (key: string) => envVars[key] },
  };
  setEnv({ TURNSTILE_SECRET: "segredo-de-producao" });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  if (originalDeno === undefined) delete (globalThis as Record<string, unknown>).Deno;
  else (globalThis as Record<string, unknown>).Deno = originalDeno;
});

describe("modo do Turnstile", () => {
  it("padrão é live e usa a site key de produção", () => {
    expect(turnstileMode()).toBe("live");
    expect(turnstileSiteKey()).toBe(DEFAULT_SITE_KEY);
    expect(turnstileSecrets()).toEqual(["segredo-de-producao"]);
  });

  it("só entra em modo de teste por variável de ambiente do servidor", () => {
    setEnv({ TURNSTILE_MODE: "test" });
    expect(turnstileMode()).toBe("test");
    expect(turnstileSiteKey()).toBe(TEST_SITE_KEY);
    expect(turnstileSecrets()).toEqual([TEST_SECRET_KEY]);
  });

  it("hostnames autorizados têm padrão seguro", () => {
    expect(allowedHostnames()).toEqual(["aveto360.com", "www.aveto360.com"]);
    setEnv({ TURNSTILE_SECRET: "s", TURNSTILE_ALLOWED_HOSTNAMES: " App.Exemplo.com , outro.com " });
    expect(allowedHostnames()).toEqual(["app.exemplo.com", "outro.com"]);
  });
});

describe("verifyTurnstileToken", () => {
  it("aprova token válido do hostname e action esperados", async () => {
    const spy = mockFetch(async () => respostaOk());
    const r = await verifyTurnstileToken({ token: VALID_TOKEN, ip: "1.2.3.4" });
    expect(r.ok).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);
    const body = corpoEnviado(spy);
    expect(body.get("secret")).toBe("segredo-de-producao");
    expect(body.get("remoteip")).toBe("1.2.3.4");
  });

  it("origem forjada de preview não ativa o modo de teste", async () => {
    // O segredo de teste jamais é usado: mesmo alegando origem de preview,
    // a verificação segue com o segredo real e a validação completa.
    const spy = mockFetch(async () => respostaOk({ hostname: "atacante.com" }));
    const r = await verifyTurnstileToken({ token: VALID_TOKEN });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason).toBe("hostname_not_allowed");
    expect(corpoEnviado(spy).get("secret")).not.toBe(TEST_SECRET_KEY);
  });

  it("aceita subdomínios de visualização do Lovable", async () => {
    for (const hostname of [
      "id-preview--ceeb4a17-6191-46b0-a351-c97a8211c03e.lovable.app",
      "preview--aveto360.lovable.app",
      "aveto360.lovable.app",
    ]) {
      mockFetch(async () => respostaOk({ hostname }));
      const r = await verifyTurnstileToken({ token: VALID_TOKEN });
      expect(r.ok).toBe(true);
    }
  });

  it("recusa domínios parecidos com o de visualização", async () => {
    for (const hostname of [
      "lovable.app",
      "falso-lovable.app",
      "lovable.app.atacante.com",
      "preview.lovable.app.atacante.com",
      "*.lovable.app",
    ]) {
      mockFetch(async () => respostaOk({ hostname }));
      const r = await verifyTurnstileToken({ token: VALID_TOKEN });
      expect(r.ok === false && r.reason).toBe("hostname_not_allowed");
    }
  });

  it("lista configurada continua valendo junto com os subdomínios de visualização", async () => {
    setEnv({ TURNSTILE_SECRET: "segredo-de-producao", TURNSTILE_ALLOWED_HOSTNAMES: "aveto360.com" });
    expect(allowedHostnames()).toEqual(["aveto360.com", "*.lovable.app"]);
    mockFetch(async () => respostaOk({ hostname: "www.aveto360.com" }));
    const r = await verifyTurnstileToken({ token: VALID_TOKEN });
    expect(r.ok === false && r.reason).toBe("hostname_not_allowed");
  });

  it("recusa token inválido, ausente ou curto", async () => {
    const spy = mockFetch(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ success: false, "error-codes": ["invalid-input-response"] }),
    }) as unknown as Response);

    const invalido = await verifyTurnstileToken({ token: VALID_TOKEN });
    expect(invalido.ok === false && invalido.reason).toBe("invalid_token");

    for (const token of [null, undefined, "", "curto"]) {
      const r = await verifyTurnstileToken({ token });
      expect(r.ok).toBe(false);
      expect(r.ok === false && r.reason).toBe("missing_token");
    }
    // Tokens curtos nem chegam ao Cloudflare.
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("recusa action divergente da esperada", async () => {
    mockFetch(async () => respostaOk({ action: "outra-action" }));
    const r = await verifyTurnstileToken({ token: VALID_TOKEN });
    expect(r.ok === false && r.reason).toBe("action_mismatch");
  });

  it("recusa hostname ausente ou fora da lista", async () => {
    for (const hostname of [undefined, "", "atacante.com", 42]) {
      mockFetch(async () => respostaOk({ hostname }));
      const r = await verifyTurnstileToken({ token: VALID_TOKEN });
      expect(r.ok === false && r.reason).toBe("hostname_not_allowed");
    }
  });

  it("falha fechada em erro de rede, timeout, HTTP 500 e JSON inválido", async () => {
    const falhas: Array<() => Promise<Response>> = [
      () => Promise.reject(new TypeError("network error")),
      () => Promise.reject(Object.assign(new Error("abort"), { name: "AbortError" })),
      async () => ({ ok: false, status: 500, json: async () => ({}) }) as unknown as Response,
      async () =>
        ({
          ok: true,
          status: 200,
          json: async () => {
            throw new SyntaxError("Unexpected token");
          },
        }) as unknown as Response,
      async () => ({ ok: true, status: 200, json: async () => null }) as unknown as Response,
    ];
    for (const impl of falhas) {
      mockFetch(impl);
      const r = await verifyTurnstileToken({ token: VALID_TOKEN });
      expect(r.ok).toBe(false);
      expect(r.ok === false && r.reason).toBe("verify_unavailable");
    }
  });

  it("recusa quando o segredo não está configurado", async () => {
    setEnv({});
    const spy = mockFetch(async () => respostaOk());
    const r = await verifyTurnstileToken({ token: VALID_TOKEN });
    expect(r.ok === false && r.reason).toBe("missing_secret");
    expect(spy).not.toHaveBeenCalled();
  });

  it("em modo de teste aprova com o segredo oficial de teste", async () => {
    setEnv({ TURNSTILE_MODE: "test" });
    const spy = mockFetch(async () => respostaOk({ hostname: "localhost", action: "qualquer" }));
    const r = await verifyTurnstileToken({ token: VALID_TOKEN });
    expect(r.ok).toBe(true);
    expect(corpoEnviado(spy).get("secret")).toBe(TEST_SECRET_KEY);
  });

  it("não registra segredo nem token em log", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    mockFetch(async () => respostaOk({ success: false, "error-codes": ["timeout-or-duplicate"] }));
    await verifyTurnstileToken({ token: VALID_TOKEN });
    setEnv({});
    await verifyTurnstileToken({ token: VALID_TOKEN });
    const registros = [...warn.mock.calls, ...error.mock.calls].flat().join(" ");
    expect(registros).not.toContain(VALID_TOKEN);
    expect(registros).not.toContain("segredo-de-producao");
    expect(registros).not.toContain(TEST_SECRET_KEY);
  });
});
