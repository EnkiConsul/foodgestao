import { describe, expect, it } from "vitest";
import { aniversarioContratacao, dataInicioVinculoAtual, elegivelAniversarioContratacao } from "../aniversarios-contratacao";

describe("aniversário do vínculo atual", () => {
  const hoje = new Date(2026, 9, 27);
  it("não comemora a admissão provisória da Verônica", () => {
    expect(aniversarioContratacao({ regime: "freelancer", origem_cadastro: "preadmissao_rotina", data_admissao: "2025-10-12" }, "2026-10", hoje)).toBeNull();
  });
  it("não comemora zero anos na data de admissão", () => {
    expect(aniversarioContratacao({ regime: "clt", data_admissao: "2026-10-12" }, "2026-10", hoje)).toBeNull();
  });
  it("comemora o primeiro ano completo", () => {
    expect(aniversarioContratacao({ regime: "clt", data_admissao: "2025-10-12" }, "2026-10", hoje)?.anosCompletos).toBe(1);
  });
  it.each(["freelancer", "pj", "mei"])("exclui %s", (regime) => {
    expect(elegivelAniversarioContratacao({ regime })).toBe(false);
  });
  it.each(["clt", "intermitente", "estagio", "temporario"])("aceita %s formalizado", (regime) => {
    expect(elegivelAniversarioContratacao({ regime })).toBe(true);
  });
  it("aceita sócio", () => {
    expect(elegivelAniversarioContratacao({ regime: "pj", vinculo_label: "Sócio" })).toBe(true);
  });
  it("provisório não se torna elegível pelo rótulo", () => {
    expect(elegivelAniversarioContratacao({ regime: "clt", origem_cadastro: "preadmissao_rotina" })).toBe(false);
  });
  it("freelancer convertido começa na data formal", () => {
    expect(aniversarioContratacao({ regime: "clt", data_admissao: "2024-10-12", data_base_contagem: "2026-11-03" }, "2027-11", hoje)).toMatchObject({ anosCompletos: 1, diaMes: "03/11" });
  });
  it("recontratação nunca soma a base do contrato anterior", () => {
    expect(dataInicioVinculoAtual({ data_admissao: "2026-10-12", data_base_contagem: "2020-01-01" })).toBe("2026-10-12");
  });
  it("CLT desligado e recontratado freelancer não comemora", () => {
    expect(aniversarioContratacao({ regime: "freelancer", data_admissao: "2025-10-12", data_base_contagem: "2020-01-01" }, "2026-10", hoje)).toBeNull();
  });
});