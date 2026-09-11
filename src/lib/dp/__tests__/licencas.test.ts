import { describe, expect, it } from "vitest";
import {
  DURACAO_PADRAO_DIAS,
  TIPOS_AFASTAMENTO,
  isTipoAfastamento,
  isTipoLicenca,
  labelAfastamento,
  licencaCobre,
  situacaoRetorno,
  sugestaoDataFim,
} from "@/lib/dp/licencas";

describe("licenças (maternidade/paternidade)", () => {
  it("reconhece os tipos de licença e os trata como afastamento", () => {
    expect(isTipoLicenca("licenca_maternidade")).toBe(true);
    expect(isTipoLicenca("licenca_paternidade")).toBe(true);
    expect(isTipoLicenca("atestado")).toBe(false);
    expect(TIPOS_AFASTAMENTO).toContain("atestado");
    expect(TIPOS_AFASTAMENTO).toContain("licenca_maternidade");
    expect(isTipoAfastamento("licenca_paternidade")).toBe(true);
    expect(isTipoAfastamento("folga")).toBe(false);
  });

  it("duração padrão: 120 dias maternidade, 5 dias paternidade", () => {
    expect(DURACAO_PADRAO_DIAS.licenca_maternidade).toBe(120);
    expect(DURACAO_PADRAO_DIAS.licenca_paternidade).toBe(5);
    expect(sugestaoDataFim("licenca_maternidade", "2026-02-01")).toBe("2026-05-31");
    expect(sugestaoDataFim("licenca_paternidade", "2026-02-01")).toBe("2026-02-05");
    expect(sugestaoDataFim("atestado", "2026-02-01")).toBeNull();
  });

  it("rótulos amigáveis", () => {
    expect(labelAfastamento("licenca_maternidade")).toBe("Licença-maternidade");
    expect(labelAfastamento("atestado")).toBe("Atestado");
  });

  it("cobre o período, inclusive retroativo", () => {
    const lic = {
      colaborador_id: "c1",
      tipo: "licenca_maternidade",
      data_alvo: "2026-02-01",
      data_fim: "2026-05-31",
    };
    expect(licencaCobre(lic, new Date(2026, 2, 15))).toBe(true);
    expect(licencaCobre(lic, new Date(2026, 0, 31))).toBe(false);
    expect(licencaCobre(lic, new Date(2026, 5, 1))).toBe(false);
  });

  it("lembrete de retorno: 30 dias antes, vencido depois do fim", () => {
    const lic = {
      colaborador_id: "c1",
      tipo: "licenca_maternidade",
      data_alvo: "2026-02-01",
      data_fim: "2026-05-31",
    };
    expect(situacaoRetorno(lic, new Date(2026, 1, 10))).toBe("ok");
    expect(situacaoRetorno(lic, new Date(2026, 4, 1))).toBe("lembrete"); // 30 dias antes
    expect(situacaoRetorno(lic, new Date(2026, 4, 31))).toBe("lembrete");
    expect(situacaoRetorno(lic, new Date(2026, 5, 1))).toBe("vencido");
    // ainda não começou
    expect(situacaoRetorno(lic, new Date(2026, 0, 20))).toBeNull();
  });
});
