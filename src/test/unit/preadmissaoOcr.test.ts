import { describe, expect, it } from "vitest";
import { limparCampos } from "../../../supabase/functions/_shared/preadmissao-ocr";

describe("leitura automática da pré-admissão", () => {
  it("converte data brasileira e descarta CPF incompleto", () => {
    const r = limparCampos("identidade", { data_nascimento: "05/03/1990", cpf: "123.456" });
    expect(r.data_nascimento).toBe("1990-03-05");
    expect(r.cpf).toBeUndefined();
  });

  it("só aceita campos do próprio documento", () => {
    const r = limparCampos("comprovante_endereco", { cep: "74.000-000", cpf: "12345678901", uf: "go" });
    expect(r).toEqual({ cep: "74000000", uf: "GO" });
  });
});
