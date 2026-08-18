import { describe, expect, it } from "vitest";
import { regimeRisco } from "@/lib/dp/regime-riscos";

describe("risco jurídico do vínculo", () => {
  it("Sócio não recebe o alerta de pejotização nem atalhos de regime", () => {
    const r = regimeRisco({ regime: "pj", vinculo: "Socio", temHorarioDefinido: true });
    expect(r?.tipo).toBe("socio");
    expect(r?.titulo).not.toMatch(/pejotiza/i);
    expect(r?.mensagem).toMatch(/pró-labore/i);
    expect(r?.atalhos).toHaveLength(0);
    expect(r?.verMaisLabel).toBeUndefined();
  });

  it("PJ e MEI seguem com o alerta de pejotização e atalhos", () => {
    for (const regime of ["pj", "mei"]) {
      const r = regimeRisco({ regime, vinculo: "PJ", temHorarioDefinido: true });
      expect(r?.tipo).toBe("pj");
      expect(r?.titulo).toMatch(/pejotiza/i);
      expect(r?.atalhos.map((a) => a.regime)).toEqual(["intermitente", "clt"]);
    }
  });

  it("Autônomo tem orientação própria de autonomia", () => {
    const r = regimeRisco({ regime: "pj", vinculo: "Autonomo" });
    expect(r?.tipo).toBe("autonomo");
    expect(r?.mensagem).not.toMatch(/MEI/);
  });

  it("vínculos formais não geram alerta", () => {
    expect(regimeRisco({ regime: "clt", vinculo: "CLT" })).toBeNull();
    expect(regimeRisco({ regime: "intermitente", vinculo: "Intermitente" })).toBeNull();
  });
});
