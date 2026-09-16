import { describe, it, expect } from "vitest";
import {
  ehErroHistoricoVinculado,
  mensagemHistoricoVinculado,
  traduzErroExclusao,
} from "@/lib/finance/exclusaoHistorico";

describe("exclusão bloqueada por histórico financeiro", () => {
  it("reconhece violação de chave estrangeira pelo código", () => {
    expect(ehErroHistoricoVinculado({ code: "23503", message: "update or delete on table" })).toBe(true);
  });

  it("reconhece a mensagem textual da chave estrangeira", () => {
    expect(
      ehErroHistoricoVinculado({
        message: 'update or delete violates foreign key constraint "fk_transactions_category"',
      }),
    ).toBe(true);
  });

  it("reconhece o bloqueio da trigger de conta contábil", () => {
    expect(
      ehErroHistoricoVinculado({
        code: "P0001",
        message: "CONTA_CONTABIL_COM_HISTORICO: existem lançamentos vinculados",
      }),
    ).toBe(true);
  });

  it("não confunde outros erros", () => {
    expect(ehErroHistoricoVinculado({ code: "42501", message: "permission denied" })).toBe(false);
    expect(ehErroHistoricoVinculado(null)).toBe(false);
    expect(traduzErroExclusao({ code: "42501" }, "categoria")).toBeNull();
  });

  it("sugere inativar onde o cadastro permite", () => {
    const msg = mensagemHistoricoVinculado("forma de pagamento", "PIX");
    expect(msg.title).toBe("Não é possível excluir");
    expect(msg.description).toContain('"PIX"');
    expect(msg.description).toContain("inative o cadastro");
  });

  it("não sugere inativar cartão", () => {
    expect(mensagemHistoricoVinculado("cartão").description).toContain("reclassifique os lançamentos");
  });
});
