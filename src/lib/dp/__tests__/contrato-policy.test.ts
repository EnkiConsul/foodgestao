import { describe, it, expect } from "vitest";
import { contratoPolicy, isIntermitente } from "@/lib/dp/contrato-policy";

describe("contratoPolicy", () => {
  it("trata CLT como jornada obrigatória com validações celetistas", () => {
    const p = contratoPolicy("clt");
    expect(p.jornadaComoDisponibilidade).toBe(false);
    expect(p.validaCargaSemanal).toBe(true);
    expect(p.exigeFolgaSemanal).toBe(true);
    expect(p.participaConformidadeDsr).toBe(true);
    expect(p.jornadaHint).toBeNull();
  });

  it("trata intermitente como disponibilidade habitual sem validação de 44h", () => {
    const p = contratoPolicy("intermitente");
    expect(p.jornadaComoDisponibilidade).toBe(true);
    expect(p.validaCargaSemanal).toBe(false);
    expect(p.exigeFolgaSemanal).toBe(false);
    expect(p.participaConformidadeDsr).toBe(false);
    expect(p.participaEscalaAutomatica).toBe(false);
    expect(p.horasPorConvocacao).toBe(true);
    expect(p.jornadaHint).toContain("disponibilidade habitual");
  });

  it("estágio e temporário herdam o comportamento celetista", () => {
    for (const r of ["estagio", "temporario"]) {
      expect(contratoPolicy(r).validaCargaSemanal).toBe(true);
      expect(contratoPolicy(r).jornadaComoDisponibilidade).toBe(false);
    }
  });

  it("PJ e MEI não entram em conformidade DSR nem validam 44h", () => {
    for (const r of ["pj", "mei"]) {
      expect(contratoPolicy(r).participaConformidadeDsr).toBe(false);
      expect(contratoPolicy(r).validaCargaSemanal).toBe(false);
    }
  });

  it("regime ausente ou desconhecido cai no padrão CLT", () => {
    expect(contratoPolicy(null).regime).toBe("clt");
    expect(contratoPolicy(undefined).regime).toBe("clt");
    expect(contratoPolicy("aprendiz_futuro").regime).toBe("clt");
  });

  it("adiantamento salarial só existe em contratos com salário mensal em folha", () => {
    expect(contratoPolicy("clt").permiteAdiantamento).toBe(true);
    expect(contratoPolicy("estagio").permiteAdiantamento).toBe(true);
    expect(contratoPolicy("temporario").permiteAdiantamento).toBe(true);
    expect(contratoPolicy("intermitente").permiteAdiantamento).toBe(false);
    expect(contratoPolicy("intermitente").adiantamentoHint).toContain("convocação");
    expect(contratoPolicy("pj").permiteAdiantamento).toBe(false);
    expect(contratoPolicy("mei").permiteAdiantamento).toBe(false);
  });

  it("isIntermitente reflete a política", () => {
    expect(isIntermitente("intermitente")).toBe(true);
    expect(isIntermitente("clt")).toBe(false);
    expect(isIntermitente(null)).toBe(false);
  });
});
