import { describe, it, expect, vi, beforeEach } from "vitest";

const listFactors = vi.fn();
const rpc = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { mfa: { listFactors: () => listFactors() } },
    rpc: (...args: unknown[]) => rpc(...args),
  },
}));

const { avaliarAvisoMfa } = await import("@/hooks/useMfaNudge");

const semFator = { data: { totp: [] }, error: null };
const comFator = { data: { totp: [{ id: "f1", status: "verified" }] }, error: null };
const estado = (opt_out: boolean, last_shown_at: string | null) => ({
  data: [{ opt_out, last_shown_at }],
  error: null,
});

describe("aviso opcional de verificação em duas etapas", () => {
  beforeEach(() => {
    listFactors.mockReset();
    rpc.mockReset();
  });

  it("mostra quando a conta não tem 2FA e nunca viu o aviso", async () => {
    listFactors.mockResolvedValue(semFator);
    rpc.mockResolvedValue(estado(false, null));
    await expect(avaliarAvisoMfa()).resolves.toBe(true);
  });

  it("nunca mostra quando a conta já tem 2FA ativo", async () => {
    listFactors.mockResolvedValue(comFator);
    rpc.mockResolvedValue(estado(false, null));
    await expect(avaliarAvisoMfa()).resolves.toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("nunca mostra quando o usuário pediu para não ver mais", async () => {
    listFactors.mockResolvedValue(semFator);
    rpc.mockResolvedValue(estado(true, null));
    await expect(avaliarAvisoMfa()).resolves.toBe(false);
  });

  it("não repete no mesmo dia", async () => {
    listFactors.mockResolvedValue(semFator);
    rpc.mockResolvedValue(estado(false, new Date().toISOString()));
    await expect(avaliarAvisoMfa()).resolves.toBe(false);
  });

  it("volta a mostrar em um novo dia", async () => {
    listFactors.mockResolvedValue(semFator);
    const ontem = new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString();
    rpc.mockResolvedValue(estado(false, ontem));
    await expect(avaliarAvisoMfa()).resolves.toBe(true);
  });

  it("não mostra quando a checagem falha", async () => {
    listFactors.mockResolvedValue({ data: null, error: { message: "falhou" } });
    await expect(avaliarAvisoMfa()).resolves.toBe(false);

    listFactors.mockResolvedValue(semFator);
    rpc.mockResolvedValue({ data: null, error: { message: "falhou" } });
    await expect(avaliarAvisoMfa()).resolves.toBe(false);
  });
});
