import { describe, expect, it } from "vitest";
import {
  assinaEmPapelHoje, canaisReciboParaModo, hojeBrasilia, modoAssinaturaEm, situacaoModoAssinatura,
  type RegistroModoAssinatura,
} from "@/lib/dp/modo-assinatura";

const r = (modo: "digital" | "fisica", vigente_desde: string, created_at = `${vigente_desde}T12:00:00Z`): RegistroModoAssinatura => ({
  colaborador_id: "c1", modo, vigente_desde, created_at,
});

describe("modo de assinatura com vigência", () => {
  it("sem registro, assina no celular", () => {
    expect(modoAssinaturaEm([], "2026-11-11")).toBe("digital");
  });

  it("documento antes da data de papel continua no celular; a partir dela, papel", () => {
    const h = [r("fisica", "2026-11-11")];
    expect(modoAssinaturaEm(h, "2026-11-10")).toBe("digital");
    expect(modoAssinaturaEm(h, "2026-11-11")).toBe("fisica");
  });

  it("volta ao celular só a partir da nova data (antes segue papel)", () => {
    const h = [r("fisica", "2026-01-10"), r("digital", "2026-12-01")];
    expect(modoAssinaturaEm(h, "2026-11-30")).toBe("fisica");
    expect(modoAssinaturaEm(h, "2026-12-01")).toBe("digital");
  });

  it("na mesma data vale o registro mais recente", () => {
    const h = [r("fisica", "2026-05-01", "2026-05-01T10:00:00Z"), r("digital", "2026-05-01", "2026-05-01T11:00:00Z")];
    expect(modoAssinaturaEm(h, "2026-05-02")).toBe("digital");
  });

  it("mostra a troca agendada para depois de hoje", () => {
    const s = situacaoModoAssinatura([r("fisica", "2026-01-10"), r("digital", "2026-12-01")], "2026-11-11");
    expect(s.atual).toBe("fisica");
    expect(s.desde).toBe("2026-01-10");
    expect(s.proxima).toEqual({ modo: "digital", desde: "2026-12-01" });
  });

  it("selo de papel só para quem assina em papel hoje", () => {
    expect(assinaEmPapelHoje([r("fisica", "2026-12-01")], "2026-11-11")).toBe(false);
    expect(assinaEmPapelHoje([r("fisica", "2026-11-01")], "2026-11-11")).toBe(true);
    expect(assinaEmPapelHoje(undefined, "2026-11-11")).toBe(false);
  });

  it("recibo de quem assina em papel começa à mão e não vai ao portal", () => {
    expect(canaisReciboParaModo("fisica")).toEqual({ padrao: "fisico", portalPermitido: false });
    expect(canaisReciboParaModo("digital")).toEqual({ padrao: "portal", portalPermitido: true });
  });

  it("hoje é o dia de Brasília, não o UTC", () => {
    // 01:30 UTC de 12/11 ainda é 11/11 em Brasília.
    expect(hojeBrasilia(new Date("2026-11-12T01:30:00Z"))).toBe("2026-11-11");
  });
});
