import { describe, expect, it } from "vitest";
import { pendenciaDocumento } from "../preadmissao-correcao";

describe("integridade da correção documental", () => {
  it("não considera RG somente com frente completo", () => {
    expect(pendenciaDocumento("identidade", [{ parte: 1 }])).toBe("Falta enviar o verso");
  });
  it("exige frente mesmo que verso esteja presente", () => {
    expect(pendenciaDocumento("identidade", [{ parte: 2 }])).toBe("Falta enviar a frente");
  });
  it("aceita frente e verso e PDF único", () => {
    expect(pendenciaDocumento("identidade", [{ parte: 1 }, { parte: 2 }])).toBeNull();
    expect(pendenciaDocumento("identidade", [{ parte: 1, mime_type: "application/pdf" }])).toBeNull();
  });
  it("documento recusado não satisfaz o resumo", () => {
    expect(pendenciaDocumento("foto_3x4", [{ parte: 1, status: "recusado" }])).toBe("Reenviar documento recusado");
  });
  it("aceita arquivo único mesmo enviado no espaço do verso", () => {
    expect(pendenciaDocumento("identidade", [{ parte: 2, mime_type: "application/pdf" }])).toBeNull();
    expect(pendenciaDocumento("identidade", [{ parte: 2, parte_rotulo: "Frente e verso" }])).toBeNull();
  });
});