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
    await expect(assinarDocumento("doc-1")).resolves.toBe("a-1");
    expect(invoke).toHaveBeenCalledWith("dp-documento-aceitar", {
      body: { documento_id: "doc-1" },
    });
    // Nada de empresa, colaborador ou resumo de conteúdo vindo da tela.
    const body = invoke.mock.calls[0][1].body as Record<string, unknown>;
    expect(Object.keys(body)).toEqual(["documento_id"]);
  });

  it("mostra a frase de negócio devolvida pelo servidor", async () => {
    invoke.mockResolvedValue({
      data: null,
      error: {
        message: "Edge Function returned a non-2xx status code",
        context: { json: async () => ({ error: "Este documento não está disponível para você." }) },
      },
    });
    await expect(assinarDocumento("doc-2")).rejects.toThrow(
      "Este documento não está disponível para você.",
    );
  });

  it("falha quando o servidor não confirma a assinatura", async () => {
    invoke.mockResolvedValue({ data: {}, error: null });
    await expect(assinarDocumento("doc-3")).rejects.toThrow(
      "Não foi possível registrar a assinatura",
    );
  });
});
