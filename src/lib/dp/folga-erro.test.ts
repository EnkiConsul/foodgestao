import { describe, expect, it } from "vitest";
import { mensagemErroFolga } from "./folga-erro";

describe("explicação de erros de folga", () => {
  it("preserva erros já traduzidos em vez de ocultar a razão", () => {
    expect(mensagemErroFolga(new Error("Este dia já atingiu o limite de pessoas em folga.")))
      .toBe("Este dia já atingiu o limite de pessoas em folga.");
  });
  it("preserva a justificativa específica da compensatória", () => {
    expect(mensagemErroFolga({ message: "JUSTIFICATIVA_OBRIGATORIA: informe a justificativa da folga compensatória." }))
      .toBe("informe a justificativa da folga compensatória.");
  });
  it("não confunde entrada inválida com troca semanal", () => {
    expect(mensagemErroFolga({ message: "INVALID_INPUT: informe o tipo da folga." })).toBe("informe o tipo da folga.");
  });
  it("explica indisponibilidade sem mensagem do servidor", () => {
    expect(mensagemErroFolga(null)).toBe("Não foi possível salvar a folga. Verifique sua conexão e tente novamente.");
  });
});