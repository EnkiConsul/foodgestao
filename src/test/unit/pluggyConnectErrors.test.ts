import { describe, it, expect } from "vitest";
import { describeConnectError } from "@/lib/pluggy/connectErrors";

describe("describeConnectError", () => {
  it("reconhece a falha de PAR do Santander pelo texto", () => {
    const d = describeConnectError({
      code: null,
      message: "400 - server_error: Unable to retrieve pushed authorization request",
    });
    expect(d.title).toBe("O banco não concluiu a autorização");
    expect(d.hint).toMatch(/sem recarregar/i);
  });

  it("reconhece server_error pelo código", () => {
    const d = describeConnectError({ code: "server_error", message: "Oops" });
    expect(d.title).toBe("O banco não concluiu a autorização");
    expect(d.code).toBe("server_error");
  });

  it("mapeia credenciais inválidas", () => {
    expect(describeConnectError({ code: "INVALID_CREDENTIALS" }).title).toMatch(/Credenciais/i);
  });

  it("mapeia indisponibilidade do banco", () => {
    expect(describeConnectError({ code: "SITE_NOT_AVAILABLE" }).title).toMatch(/indispon/i);
  });

  it("mapeia tempo esgotado", () => {
    expect(describeConnectError({ code: "USER_INPUT_TIMEOUT" }).title).toMatch(/Tempo esgotado/i);
  });

  it("preserva mensagem desconhecida", () => {
    const d = describeConnectError({ code: "xyz_123", message: "Falha esquisita do banco" });
    expect(d.message).toBe("Falha esquisita do banco");
    expect(d.code).toBe("xyz_123");
  });

  it("tem fallback sem código e sem mensagem", () => {
    const d = describeConnectError({});
    expect(d.title).toBe("Não foi possível concluir a conexão");
    expect(d.code).toBeNull();
  });
});
