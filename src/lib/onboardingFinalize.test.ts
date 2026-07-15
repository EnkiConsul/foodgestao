import { describe, it, expect, vi, beforeEach } from "vitest";
import { marcarOnboardingConcluido } from "./onboardingFinalize";

const eqMock: any = vi.fn();
const updateMock: any = vi.fn(() => ({ eq: eqMock }));
const fromMock: any = vi.fn(() => ({ update: updateMock }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (name: string) => fromMock(name) },
}));

describe("marcarOnboardingConcluido", () => {
  beforeEach(() => {
    fromMock.mockClear();
    updateMock.mockClear();
    eqMock.mockReset();
  });

  it("atualiza profiles com onboarding_completed=true e SEM profile_type (regressão do enum)", async () => {
    eqMock.mockResolvedValueOnce({ error: null });

    const res = await marcarOnboardingConcluido("user-123");

    expect(res).toEqual({ ok: true });
    expect(fromMock).toHaveBeenCalledWith("profiles");

    const payload = updateMock.mock.calls[0][0];
    expect(payload).toEqual({ onboarding_completed: true });
    // Regressão: profile_type nunca deve ser enviado (enum aceita só pf|mei|microempresa|hibrido).
    expect(payload).not.toHaveProperty("profile_type");

    expect(eqMock).toHaveBeenCalledWith("user_id", "user-123");
  });

  it("retorna ok=false quando o update falha", async () => {
    const error = { code: "22P02", message: "invalid input value for enum profile_type" };
    eqMock.mockResolvedValueOnce({ error });

    const res = await marcarOnboardingConcluido("user-123");
    expect(res.ok).toBe(false);
    expect(res.error).toBe(error);
  });
});
