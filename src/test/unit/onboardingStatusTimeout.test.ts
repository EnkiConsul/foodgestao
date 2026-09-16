import { describe, expect, it, vi, beforeEach } from "vitest";

const maybeSingle = vi.fn();
const fromMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (table: string) => fromMock(table) },
}));

vi.mock("@/lib/onboardingFinalize", () => ({
  marcarOnboardingConcluido: vi.fn(async () => undefined),
}));

import { resolveOnboardingStatus } from "@/lib/onboardingStatus";

/** Encadeamento mínimo usado pelo resolvedor: profiles e empresas. */
function mockTabelas(opts: { travarPrimeira?: boolean } = {}) {
  let chamadasProfiles = 0;
  fromMock.mockImplementation((table: string) => {
    if (table === "profiles") {
      chamadasProfiles += 1;
      const travar = opts.travarPrimeira && chamadasProfiles === 1;
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: travar
              ? () => new Promise(() => {})
              : () => {
                  maybeSingle();
                  return Promise.resolve({ data: { onboarding_completed: true } });
                },
          }),
        }),
      };
    }
    return {
      select: () => ({
        eq: () => ({ eq: () => ({ limit: () => Promise.resolve({ data: [] }) }) }),
      }),
    };
  });
}

describe("resolveOnboardingStatus", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    maybeSingle.mockClear();
    fromMock.mockReset();
  });

  it("resolve normalmente quando a consulta responde", async () => {
    mockTabelas();
    const res = await resolveOnboardingStatus("user-1");
    expect(res.completed).toBe(true);
  });

  it("tenta de novo quando a primeira consulta não responde no prazo", async () => {
    mockTabelas({ travarPrimeira: true });
    const promessa = resolveOnboardingStatus("user-1");
    await vi.advanceTimersByTimeAsync(6_000);
    const res = await promessa;
    expect(res.completed).toBe(true);
    expect(maybeSingle).toHaveBeenCalledTimes(1);
  });
});
