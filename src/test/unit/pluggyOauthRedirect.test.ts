import { describe, it, expect } from "vitest";
import { isAllowedOauthRedirectUri, parseAllowedHosts } from "../../../supabase/functions/_shared/pluggy-oauth-redirect";

describe("oauthRedirectUri da Pluggy", () => {
  const padrao = parseAllowedHosts(undefined);
  it("aceita o domínio de produção", () => {
    expect(isAllowedOauthRedirectUri("https://aveto360.com/conexoes", padrao)).toBe(true);
  });
  it("rejeita subdomínio arbitrário de lovable.app", () => {
    expect(isAllowedOauthRedirectUri("https://atacante.lovable.app/x", padrao)).toBe(false);
  });
  it("rejeita http e credenciais na URL", () => {
    expect(isAllowedOauthRedirectUri("http://aveto360.com/", padrao)).toBe(false);
    expect(isAllowedOauthRedirectUri("https://u:p@aveto360.com/", padrao)).toBe(false);
  });
  it("lista da variável substitui o padrão e ignora curingas", () => {
    const env = parseAllowedHosts("app.exemplo.com, *.lovable.app");
    expect(isAllowedOauthRedirectUri("https://app.exemplo.com/", env)).toBe(true);
    expect(isAllowedOauthRedirectUri("https://aveto360.com/", env)).toBe(false);
    expect(isAllowedOauthRedirectUri("https://x.lovable.app/", env)).toBe(false);
  });
});
