import { describe, it, expect } from "vitest";
import { isAlreadyRegisteredSignup } from "@/lib/authSignupSignals";

describe("isAlreadyRegisteredSignup", () => {
  it("detecta e-mail já cadastrado quando as identidades vêm vazias", () => {
    expect(isAlreadyRegisteredSignup({ user: { identities: [] }, session: null })).toBe(true);
  });

  it("detecta e-mail já cadastrado quando identities é nulo/ausente", () => {
    expect(isAlreadyRegisteredSignup({ user: { identities: null }, session: null })).toBe(true);
    expect(isAlreadyRegisteredSignup({ user: {}, session: null })).toBe(true);
  });

  it("não sinaliza duplicidade para e-mail novo aguardando confirmação", () => {
    expect(
      isAlreadyRegisteredSignup({ user: { identities: [{ id: "abc" }] }, session: null }),
    ).toBe(false);
  });

  it("não sinaliza duplicidade quando há sessão (login imediato)", () => {
    expect(
      isAlreadyRegisteredSignup({ user: { identities: [] }, session: { access_token: "t" } }),
    ).toBe(false);
  });

  it("não sinaliza duplicidade sem usuário na resposta", () => {
    expect(isAlreadyRegisteredSignup({ user: null, session: null })).toBe(false);
    expect(isAlreadyRegisteredSignup(null)).toBe(false);
  });
});
