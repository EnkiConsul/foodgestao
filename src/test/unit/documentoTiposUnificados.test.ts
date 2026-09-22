import { describe, expect, it } from "vitest";
import {
  DP_DOC_TIPOS_IMPORTAVEIS,
  detectarTipoDocumento,
  docTipoLabel,
  aceitaComprovante,
  tiposDoGrupo,
} from "@/lib/dp/documentoTipos";
import { DOC_TIPOS_RESCISAO } from "@/lib/dp/pendencias-documentos";

describe("Naturezas unificadas de Admissão e Desligamento", () => {
  it("oferece apenas um tipo de admissão e um de desligamento", () => {
    const admissao = DP_DOC_TIPOS_IMPORTAVEIS.filter((t) => t.grupo === "admissao").map((t) => t.value);
    const desligamento = DP_DOC_TIPOS_IMPORTAVEIS.filter((t) => t.grupo === "desligamento").map((t) => t.value);
    expect(admissao).toEqual(["admissao", "aso_admissional"]);
    expect(desligamento).toEqual(["aviso_previo", "desligamento", "aso_demissional"]);
  });

  it("reconhece contrato e ficha como Admissão", () => {
    expect(detectarTipoDocumento("Contrato de trabalho.pdf")).toBe("admissao");
    expect(detectarTipoDocumento("Ficha de registro")).toBe("admissao");
  });

  it("reconhece TRCT como Desligamento, mantendo Aviso Prévio", () => {
    expect(detectarTipoDocumento("TRCT assinado")).toBe("desligamento");
    expect(detectarTipoDocumento("Aviso prévio indenizado")).toBe("aviso_previo");
  });

  it("mantém rótulo das naturezas antigas e as inclui nos filtros do grupo", () => {
    expect(docTipoLabel("trct")).toContain("Desligamento");
    expect(tiposDoGrupo("admissao")).toContain("contrato");
    expect(tiposDoGrupo("desligamento")).toContain("demonstrativo_rescisorio");
  });

  it("Desligamento aceita comprovante de pagamento", () => {
    expect(aceitaComprovante("desligamento")).toBe(true);
    expect(aceitaComprovante("admissao")).toBe(false);
  });
});

describe("ASO separado de Admissão e Desligamento", () => {
  it("detecta ASO admissional e demissional nos próprios tipos", () => {
    expect(detectarTipoDocumento("ASO ADMISSIONAL JOAO.pdf")).toBe("aso_admissional");
    expect(detectarTipoDocumento("exame admissional.pdf")).toBe("aso_admissional");
    expect(detectarTipoDocumento("ASO DEMISSIONAL MARIA.pdf")).toBe("aso_demissional");
    expect(detectarTipoDocumento("exame demissional.pdf")).toBe("aso_demissional");
  });

  it("mantém contrato e TRCT nos tipos unificados", () => {
    expect(detectarTipoDocumento("contrato de trabalho.pdf")).toBe("admissao");
    expect(detectarTipoDocumento("TRCT.pdf")).toBe("desligamento");
  });

  it("ASO não substitui a documentação cobrada de rescisão", () => {
    expect(DOC_TIPOS_RESCISAO as readonly string[]).not.toContain("aso_demissional");
  });
});
