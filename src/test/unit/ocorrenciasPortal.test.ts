import { describe, expect, it } from "vitest";
import {
  exigeJustificativa,
  frasesQuando,
  marcacaoDoMomento,
  opcoesDisponiveis,
  tipoOcorrenciaPortal,
} from "@/lib/dp/ocorrencias-portal";

describe("ocorrências do portal", () => {
  it("esconde opções de relógio de ponto em unidade sem ponto", () => {
    const semPonto = opcoesDisponiveis(false).map((o) => o.id);
    expect(semPonto).not.toContain("esquecimento");
    expect(semPonto).not.toContain("problema_ponto");
    expect(semPonto).toEqual(["atraso", "falta", "saida_antecipada", "atestado", "outro"]);
    expect(opcoesDisponiveis(true)).toHaveLength(7);
  });

  it("mapeia previsão e fato para os tipos existentes", () => {
    expect(tipoOcorrenciaPortal("atraso", "ocorrido", "entrada")).toBe("atraso");
    expect(tipoOcorrenciaPortal("atraso", "previsto", "entrada")).toBe("previsao_atraso");
    expect(tipoOcorrenciaPortal("atraso", "ocorrido", "intervalo_retorno")).toBe("atraso_intervalo");
    expect(tipoOcorrenciaPortal("atraso", "previsto", "intervalo_retorno")).toBe(
      "previsao_atraso_intervalo",
    );
    expect(tipoOcorrenciaPortal("falta", "previsto", null)).toBe("previsao_falta");
    expect(tipoOcorrenciaPortal("saida_antecipada", "ocorrido", null)).toBe("saida_antecipada");
    expect(tipoOcorrenciaPortal("esquecimento", "ocorrido", "saida")).toBe("esquecimento_marcacao");
    expect(tipoOcorrenciaPortal("problema_ponto", "ocorrido", "entrada")).toBe("divergencia_jornada");
    expect(tipoOcorrenciaPortal("atestado", "ocorrido", null)).toBe("atestado");
    expect(tipoOcorrenciaPortal("outro", "ocorrido", null)).toBe("divergencia_jornada");
  });

  it("converte o momento em marcação, sem marcação para Outro", () => {
    expect(marcacaoDoMomento("entrada")).toBe("entrada");
    expect(marcacaoDoMomento("intervalo_inicio")).toBe("intervalo_inicio");
    expect(marcacaoDoMomento("outro")).toBeNull();
    expect(marcacaoDoMomento(null)).toBeNull();
  });

  it("exige justificativa em Outro e no momento Outro", () => {
    expect(exigeJustificativa("outro", null)).toBe(true);
    expect(exigeJustificativa("falta", null)).toBe(true);
    expect(exigeJustificativa("atraso", "entrada")).toBe(false);
    expect(exigeJustificativa("atraso", "outro")).toBe(true);
    expect(exigeJustificativa("atestado", null)).toBe(false);
  });

  it("usa frases diferentes por opção", () => {
    expect(frasesQuando("atraso").previsto).toBe("Vou chegar atrasado hoje");
    expect(frasesQuando("falta").ocorrido).toBe("Já faltei hoje");
    expect(frasesQuando("atestado").ocorrido).toBe("Já aconteceu");
  });
});
