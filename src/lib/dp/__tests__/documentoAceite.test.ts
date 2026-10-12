import { describe, expect, it, vi, beforeEach } from "vitest";

const invoke = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: (...a: unknown[]) => invoke(...a) } },
}));

import { assinarDocumento } from "../documentoAceite";

describe("assinarDocumento", () => {
  beforeEach(() => invoke.mockReset());

  it("envia somente o identificador do documento para o servidor", async () => {
    invoke.mockResolvedValue({ data: { aceite_id: "a-1" }, error: null });
    await expect(assinarDocumento("doc-1", "data:image/png;base64,AA")).resolves.toBe("a-1");
    expect(invoke).toHaveBeenCalledWith("dp-documento-aceitar", {
      body: { documento_id: "doc-1", assinatura: "data:image/png;base64,AA" },
    });
    // Nada de empresa, colaborador ou resumo de conteúdo vindo da tela.
    const body = invoke.mock.calls[0][1].body as Record<string, unknown>;
    expect(Object.keys(body)).toEqual(["documento_id", "assinatura"]);
  });

  it("mostra a frase de negócio devolvida pelo servidor", async () => {
    invoke.mockResolvedValue({
      data: null,
      error: {
        message: "Edge Function returned a non-2xx status code",
        context: { json: async () => ({ error: "Este documento não está disponível para você." }) },
      },
    });
    await expect(assinarDocumento("doc-2", "data:image/png;base64,AA")).rejects.toThrow(
      "Este documento não está disponível para você.",
    );
  });

  it("recusa por via impressa vira aviso de regra, sem registro de erro", async () => {
    invoke.mockResolvedValue({
      data: null,
      error: { message: "non-2xx", context: { status: 409, json: async () => ({ error: "Documentos de desligamento são assinados somente à mão, na via impressa." }) } },
    });
    await expect(assinarDocumento("doc-4", "x")).rejects.toMatchObject({ name: "RegraNegada" });
  });

  it("tenta de novo em silêncio quando a conexão falha", async () => {
    vi.useFakeTimers();
    invoke
      .mockResolvedValueOnce({ data: null, error: { message: "Failed to send a request to the Edge Function" } })
      .mockResolvedValueOnce({ data: { aceite_id: "a-9" }, error: null });
    const p = assinarDocumento("doc-9", "x");
    await vi.advanceTimersByTimeAsync(2000);
    await expect(p).resolves.toBe("a-9");
    expect(invoke).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("falha quando o servidor não confirma a assinatura", async () => {
    invoke.mockResolvedValue({ data: {}, error: null });
    await expect(assinarDocumento("doc-3", "data:image/png;base64,AA")).rejects.toThrow(
      "Não foi possível registrar a assinatura",
    );
  });
});
