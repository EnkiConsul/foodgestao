import { describe, expect, it } from "vitest";
import { faltaVerso, nomeArquivoPacote } from "../documentoPartes";

describe("frente e verso", () => {
  it("print da CTPS Digital não exige verso", () => {
    expect(faltaVerso("ctps", [{ parte: 1, mime_type: "image/png" }])).toBe(false);
  });
  it("RG só com a frente exige o verso", () => {
    expect(faltaVerso("identidade", [{ parte: 1, mime_type: "image/jpeg" }])).toBe(true);
  });
  it("RG com frente e verso está completo", () => {
    expect(faltaVerso("identidade", [{ parte: 1 }, { parte: 2 }])).toBe(false);
  });
  it("PDF digital (gov.br) conta como documento completo", () => {
    expect(faltaVerso("cnh_valida", [{ parte: 1, mime_type: "application/pdf" }])).toBe(false);
  });
  it("foto única marcada como frente e verso conta como completa", () => {
    expect(faltaVerso("identidade", [{ parte: 1, parte_rotulo: "Frente e verso" }])).toBe(false);
  });
  it("comprovante de endereço nunca pede verso", () => {
    expect(faltaVerso("comprovante_endereco", [{ parte: 1 }])).toBe(false);
  });
  it("verso recusado volta a faltar", () => {
    expect(faltaVerso("identidade", [{ parte: 1 }, { parte: 2, status: "recusado" }])).toBe(true);
  });
  it("nome do pacote contábil é organizado", () => {
    expect(nomeArquivoPacote(2, "Identidade (RG)", "Frente", "jpg")).toBe("02_Identidade_RG_Frente.jpg");
  });
});
