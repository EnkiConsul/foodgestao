import { describe, expect, it } from "vitest";
import {
  DP_DOC_TIPOS_IMPORTAVEIS,
  detectarTipoDocumento,
  docTipoLabel,
  tipoAceitaComprovante,
  tiposDoGrupo,
} from "@/lib/dp/documentoTipos";

describe("Naturezas unificadas de Admissão e Desligamento", () => {
  it("oferece apenas um tipo de admissão e um de desligamento", () => {
    const admissao = DP_DOC_TIPOS_IMPORTAVEIS.filter((t) => t.grupo === "admissao").map((t) => t.value);
    const desligamento = DP_DOC_TIPOS_IMPORTAVEIS.filter((t) => t.grupo === "desligamento").map((t) => t.value);
    expect(admissao).toEqual(["admissao"]);
    expect(desligamento).toEqual(["aviso_previo", "desligamento"]);
  });

  it("reconhece contrato, ficha e ASO admissional como Admissão", () => {
    expect(detectarTipoDocumento("Contrato de trabalho.pdf")).toBe("admissao");
    expect(detectarTipoDocumento("Ficha de registro")).toBe("admissao");
    expect(detectarTipoDocumento("ASO admissional")).toBe("admissao");
  });

  it("reconhece TRCT e ASO demissional como Desligamento, mantendo Aviso Prévio", () => {
    expect(detectarTipoDocumento("TRCT assinado")).toBe("desligamento");
    expect(detectarTipoDocumento("ASO demissional")).toBe("desligamento");
    expect(detectarTipoDocumento("Aviso prévio indenizado")).toBe("aviso_previo");
  });

  it("mantém rótulo das naturezas antigas e as inclui nos filtros do grupo", () => {
    expect(docTipoLabel("trct")).toContain("Desligamento");
    expect(tiposDoGrupo("admissao")).toContain("contrato");
    expect(tiposDoGrupo("desligamento")).toContain("demonstrativo_rescisorio");
  });

  it("Desligamento aceita comprovante de pagamento", () => {
    expect(tipoAceitaComprovante("desligamento")).toBe(true);
    expect(tipoAceitaComprovante("admissao")).toBe(false);
  });
});
