import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));

import { salvarColaborador } from "./colaborador-oficial";
import { registrarConfirmacaoExcedente } from "@/lib/billing/excedente-colaboradores";

const previaCheia = {
  modo: "v2", pode_gerir: true, atual: 18, limite: 18, isento: false, valor_unit_cents: 1990,
  por_colaborador_cents: null, sugestao_upgrade: null,
};

describe("reativar colaborador com a franquia cheia", () => {
  beforeEach(() => {
    rpc.mockReset();
    registrarConfirmacaoExcedente((_p, resolve) => resolve(true));
  });

  it("pede a ciência do excedente e grava de novo, sem travar em erro", async () => {
    let tentativas = 0;
    rpc.mockImplementation(async (nome: string) => {
      if (nome === "dp_colaborador_salvar") {
        tentativas += 1;
        return tentativas === 1
          ? { data: null, error: { message: "EXCEDENTE_CONFIRMACAO_NECESSARIA" } }
          : { data: "colab-1", error: null };
      }
      if (nome === "dp_colaborador_excedente_previa") return { data: previaCheia, error: null };
      if (nome === "dp_colaborador_excedente_confirmar") return { data: null, error: null };
      throw new Error(`rpc inesperada ${nome}`);
    });

    await expect(salvarColaborador({ id: "colab-1", companyId: "emp-1", dados: { nome: "Ana", ativo: true } }))
      .resolves.toBe("colab-1");
    expect(tentativas).toBe(2);
    expect(rpc).toHaveBeenCalledWith("dp_colaborador_excedente_confirmar", expect.objectContaining({ _company_id: "emp-1" }));
  });

  it("no Enterprise (por colaborador) não pede confirmação ao cadastrar", async () => {
    rpc.mockImplementation(async (nome: string) => {
      if (nome === "dp_colaborador_excedente_previa")
        return { data: { ...previaCheia, limite: -1, atual: 44, por_colaborador_cents: 1000 }, error: null };
      if (nome === "dp_colaborador_salvar") return { data: "novo", error: null };
      throw new Error(`rpc inesperada ${nome}`);
    });
    await expect(salvarColaborador({ companyId: "emp-1", dados: { nome: "Bia" } })).resolves.toBe("novo");
    expect(rpc).not.toHaveBeenCalledWith("dp_colaborador_excedente_confirmar", expect.anything());
  });
});
