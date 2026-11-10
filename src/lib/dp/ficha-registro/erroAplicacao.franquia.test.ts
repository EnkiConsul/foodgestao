import { describe, expect, it } from "vitest";
import { erroAplicacaoFicha } from "./erroAplicacao";
import { RegraNegada } from "@/lib/dp/regraAviso";

describe("erro de franquia ao cadastrar pela ficha", () => {
  it("confirmação do excedente pendente vira orientação, não erro genérico", () => {
    const e = erroAplicacaoFicha("EXCEDENTE_CONFIRMACAO_NECESSARIA");
    expect(e).toBeInstanceOf(RegraNegada);
    expect(e.message).toContain("confirme o valor do excedente");
  });

  it("usuário sem permissão é orientado a chamar dono ou administrador", () => {
    const e = erroAplicacaoFicha("EXCEDENTE_SEM_PERMISSAO");
    expect(e).toBeInstanceOf(RegraNegada);
    expect(e.message).toContain("dono ou um administrador");
  });
});
