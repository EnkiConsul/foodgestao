import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  environment: vi.fn(), password: vi.fn(), invoke: vi.fn(), session: vi.fn(),
}));
vi.mock("@/lib/env/appEnv", () => ({ assertAmbienteValido: mocks.environment }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  auth: { signInWithPassword: mocks.password, setSession: mocks.session },
  functions: { invoke: mocks.invoke },
} }));
import { unifiedSignIn } from "@/lib/authUnified";

describe("D3 login isolado", () => {
  beforeEach(() => { vi.resetAllMocks(); mocks.environment.mockReturnValue("homologacao"); });
  it("exige autenticação real e normaliza o e-mail fictício", async () => {
    mocks.password.mockResolvedValue({ data: { session: { access_token: "test" } }, error: null });
    expect((await unifiedSignIn(" QA@example.invalid ", "test-password", "")).ok).toBe(true);
    expect(mocks.password).toHaveBeenCalledWith({ email: "qa@example.invalid", password: "test-password" });
    expect(mocks.invoke).not.toHaveBeenCalled();
  });
  it("recusa senha rejeitada pelo Auth", async () => {
    mocks.password.mockResolvedValue({ data: { session: null }, error: { message: "Invalid credentials" } });
    expect((await unifiedSignIn("qa@example.invalid", "wrong", "")).ok).toBe(false);
  });
  it.each(["real@example.com", "12345678901", "qa@example.invalid.evil.com"])("recusa identificador não fictício %s", async (identifier) => {
    expect((await unifiedSignIn(identifier, "test-password", "")).ok).toBe(false);
    expect(mocks.password).not.toHaveBeenCalled();
    expect(mocks.invoke).not.toHaveBeenCalled();
  });
  it("preserva auth-login e token CAPTCHA em produção", async () => {
    mocks.environment.mockReturnValue("producao");
    mocks.invoke.mockResolvedValue({ data: { session: { access_token: "access", refresh_token: "refresh" } }, error: null });
    mocks.session.mockResolvedValue({ error: null });
    expect((await unifiedSignIn("real@example.com", "password", "captcha-token")).ok).toBe(true);
    expect(mocks.invoke).toHaveBeenCalledWith("auth-login", { body: { identifier: "real@example.com", password: "password", turnstile_token: "captcha-token" } });
    expect(mocks.password).not.toHaveBeenCalled();
  });
  it("não autentica se configuração de ambiente for inválida", async () => {
    mocks.environment.mockImplementation(() => { throw new Error("Ambiente inválido"); });
    expect((await unifiedSignIn("qa@example.invalid", "password", "")).ok).toBe(false);
    expect(mocks.password).not.toHaveBeenCalled();
    expect(mocks.invoke).not.toHaveBeenCalled();
  });
});
