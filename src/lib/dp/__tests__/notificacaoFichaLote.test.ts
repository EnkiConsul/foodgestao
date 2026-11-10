import { describe, expect, it } from "vitest";
import { notificacaoOrigemLabel, notificacaoPathGestor } from "../notificacoes";

describe("aviso de lote de fichas", () => {
  it("abre a conferência do envio avisado", () => {
    expect(notificacaoPathGestor("dp_ficha_importacoes", "abc")).toBe("/dp/colaboradores/importar-ficha?lote=abc");
    expect(notificacaoOrigemLabel("dp_ficha_importacoes")).toBe("Fichas de registro");
  });
});
