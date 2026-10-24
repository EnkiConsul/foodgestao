import { beforeEach, describe, expect, it, vi } from "vitest";
const rpc = vi.fn(async (..._a: unknown[]) => ({ data: "id-1", error: null }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));
import { __resetErrorLogState, ehFalhaDeRede, reportError } from "@/lib/errorLog";

const ua = (v: string) => Object.defineProperty(navigator, "userAgent", { value: v, configurable: true });

describe("blindagem da auditoria de erros", () => {
  beforeEach(() => { rpc.mockClear(); __resetErrorLogState(); ua("Mozilla/5.0 (iPhone) Safari"); });

  it("queda de sinal ao chamar função do servidor e timeout são falha de rede", () => {
    expect(ehFalhaDeRede(new Error("Failed to send a request to the Edge Function"))).toBe(true);
    expect(ehFalhaDeRede(new Error("onboarding_status_timeout"))).toBe(true);
    expect(ehFalhaDeRede(new Error("duplicate key value"))).toBe(false);
  });
  it("falha de rede não grava chamado", async () => {
    await reportError({ error: new Error("Failed to send a request to the Edge Function"), surface: "Portal" });
    expect(rpc).not.toHaveBeenCalled();
  });
  it("navegador de automação não grava", async () => {
    ua("Mozilla/5.0 HeadlessChrome/120");
    await reportError({ error: new Error("removeChild falhou"), surface: "Cookies" });
    expect(rpc).not.toHaveBeenCalled();
  });
  it("mesma falha em três escutas grava uma vez", async () => {
    const e = new Error("Failed to execute 'removeChild' on 'Node'");
    await reportError({ error: e, surface: "window" });
    await reportError({ error: e, surface: "Tela" });
    await reportError({ error: e, surface: "entrada" });
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it("relatos manuais têm assinatura própria e não reabrem o anterior", async () => {
    await reportError({ error: "Relato", action: "relatar um problema" });
    await reportError({ error: "Relato", action: "relatar um problema" });
    expect(rpc).toHaveBeenCalledTimes(2);
    const fp = rpc.mock.calls.map((c) => (c[1] as { _fingerprint: string })._fingerprint);
    expect(fp[0]).not.toBe(fp[1]);
  });
});
