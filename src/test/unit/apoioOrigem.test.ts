/**
 * Origem da admissão do folguista: a tela só chama a rotina oficial e traduz a
 * recusa. Nada é gravado direto.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const rpc = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));

import { mensagemOrigemApoio, vincularOrigemApoio } from "@/lib/dp/apoio-origem";

describe("origem da admissão do folguista", () => {
  beforeEach(() => rpc.mockReset());

  it("liga o link de admissão à pessoa", async () => {
    rpc.mockResolvedValue({ data: { status: "vinculado" }, error: null });
    const r = await vincularOrigemApoio("pessoa-1", { preadmissaoId: "pre-1" });
    expect(r.status).toBe("vinculado");
    expect(rpc).toHaveBeenCalledWith("dp_pessoa_apoio_vincular_origem", {
      p_pessoa_apoio_id: "pessoa-1",
      p_preadmissao_id: "pre-1",
      p_ficha_item_id: null,
    });
  });

  it("liga a ficha de registro à pessoa", async () => {
    rpc.mockResolvedValue({ data: { status: "promovido", colaborador_id: "colab-1" }, error: null });
    const r = await vincularOrigemApoio("pessoa-1", { fichaItemId: "item-1" });
    expect(r).toEqual({ status: "promovido", colaborador_id: "colab-1" });
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_ficha_item_id: "item-1", p_preadmissao_id: null });
  });

  it("recusa da rotina oficial vira frase de tela", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "APOIO_ADMISSAO_DE_OUTRA_PESSOA" } });
    await expect(vincularOrigemApoio("pessoa-1", { preadmissaoId: "pre-1" })).rejects.toThrow();
    expect(mensagemOrigemApoio(new Error("APOIO_NAO_ENCONTRADO"))).toContain("não foi encontrada");
    expect(mensagemOrigemApoio(new Error("APOIO_ORIGEM_UNICA"))).toContain("apenas uma origem");
    expect(mensagemOrigemApoio(new Error("qualquer outra"))).toContain("Não foi possível");
  });
});
