import { describe, it, expect } from "vitest";
import {
  calcAcessoPortalAte,
  acessoPortalAtivo,
  diasRestantesCarencia,
  parseDateOnly,
} from "@/lib/dp/desligamento";

describe("desligamento — carência do portal", () => {
  it("soma 30 dias por padrão à data de demissão", () => {
    expect(calcAcessoPortalAte("2026-06-15")).toBe("2026-07-15");
  });

  it("respeita prazo customizado e viradas de mês/ano", () => {
    expect(calcAcessoPortalAte("2026-12-20", 15)).toBe("2027-01-04");
    expect(calcAcessoPortalAte("2026-01-31", 1)).toBe("2026-02-01");
    expect(calcAcessoPortalAte("2026-06-01", 0)).toBe("2026-06-01");
  });

  it("mantém acesso até o fim do dia limite", () => {
    const ate = "2026-07-15";
    expect(acessoPortalAtivo(ate, parseDateOnly("2026-07-14"))).toBe(true);
    expect(acessoPortalAtivo(ate, parseDateOnly("2026-07-15"))).toBe(true);
    expect(acessoPortalAtivo(ate, parseDateOnly("2026-07-16"))).toBe(false);
    expect(acessoPortalAtivo(null)).toBe(false);
  });

  it("calcula dias restantes", () => {
    expect(diasRestantesCarencia("2026-07-15", parseDateOnly("2026-07-05"))).toBe(10);
    expect(diasRestantesCarencia("2026-07-15", parseDateOnly("2026-07-15"))).toBe(0);
    expect(diasRestantesCarencia("2026-07-15", parseDateOnly("2026-07-20"))).toBe(-5);
    expect(diasRestantesCarencia(null)).toBeNull();
  });
});
