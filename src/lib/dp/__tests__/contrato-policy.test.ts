import { describe, it, expect } from "vitest";
import {
  contratoPolicy,
  isIntermitente,
  formasPagamentoDoRegime,
  formaPagamentoValida,
  regimeFormalizado,
  regimesPermitidosNaMudanca,
  mudancaRegimePermitida,
  exigeNovoContrato,
} from "@/lib/dp/contrato-policy";

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

describe("formas de pagamento por regime", () => {
  it("intermitente não admite mensalista", () => {
    expect(formasPagamentoDoRegime("intermitente")).toEqual(["horista", "diarista"]);
    expect(formaPagamentoValida("intermitente", "mensalista")).toBe("horista");
  });

  it("contrato com registro em carteira é sempre mensalista", () => {
    for (const regime of ["clt", "estagio", "temporario"]) {
      expect(formasPagamentoDoRegime(regime)).toEqual(["mensalista"]);
      expect(formaPagamentoValida(regime, "horista")).toBe("mensalista");
    }
  });

  it("freelancer tem remuneração flexível (diária/hora/turno/serviço/semana/mensal), fica fora da folha e exige ciência legal", () => {
    const p = contratoPolicy("freelancer");
    expect(p.formasPagamento).toEqual([
      "diarista",
      "horista",
      "por_turno",
      "servico_acordo",
      "semanal",
      "mensalista",
    ]);
    expect(p.entraEmFolha).toBe(false);
    expect(p.exigeCienciaLegal).toBe(true);
    expect(p.cienciaLegalMensagem).toBeTruthy();
    expect(p.permiteAdiantamento).toBe(false);
  });

  it("CLT mantém mensalista como padrão e entra em folha", () => {
    expect(formaPagamentoValida("clt", "mensalista")).toBe("mensalista");
    expect(contratoPolicy("clt").entraEmFolha).toBe(true);
  });
});

describe("transição de vínculo", () => {
  it("vínculos com registro são formalizados; freelancer/PJ/MEI não", () => {
    for (const r of ["clt", "intermitente", "estagio", "temporario"]) {
      expect(regimeFormalizado(r)).toBe(true);
    }
    for (const r of ["freelancer", "pj", "mei"]) {
      expect(regimeFormalizado(r)).toBe(false);
    }
  });

  it("contrato formal só oferece outros vínculos formais", () => {
    expect(regimesPermitidosNaMudanca("clt")).toEqual([
      "clt",
      "intermitente",
      "estagio",
      "temporario",
    ]);
    expect(regimesPermitidosNaMudanca("intermitente")).not.toContain("freelancer");
  });

  it("contrato informal pode ser efetivado e também trocar de informal", () => {
    const opts = regimesPermitidosNaMudanca("freelancer");
    expect(opts).toContain("clt");
    expect(opts).toContain("intermitente");
    expect(opts).toContain("pj");
  });

  it("recusa formal → informal e aceita as demais", () => {
    expect(mudancaRegimePermitida("clt", "freelancer").ok).toBe(false);
    expect(mudancaRegimePermitida("clt", "freelancer").motivo).toContain("desligamento");
    expect(mudancaRegimePermitida("intermitente", "clt").ok).toBe(true);
    expect(mudancaRegimePermitida("freelancer", "clt").ok).toBe(true);
    expect(mudancaRegimePermitida("freelancer", "pj").ok).toBe(true);
    expect(mudancaRegimePermitida("clt", "clt").ok).toBe(true);
  });

  it("efetivação exige novo contrato; mudanças dentro da formalidade não", () => {
    expect(exigeNovoContrato("freelancer", "clt")).toBe(true);
    expect(exigeNovoContrato("intermitente", "clt")).toBe(false);
    expect(exigeNovoContrato("clt", "clt")).toBe(false);
  });
});
