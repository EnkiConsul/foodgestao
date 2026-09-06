import { describe, it, expect } from "vitest";
import { folgasOfertaveis } from "@/lib/dp/troca-oferta";
import { trocaInconsistente } from "@/lib/dp/troca-apresentacao";

const folgas = [
  { id: "1", colaborador_id: "eu", data: "2026-09-06", status: "prevista" },
  { id: "2", colaborador_id: "eu", data: "2026-09-13", status: "prevista" },
  { id: "3", colaborador_id: "eu", data: "2026-09-20", status: "cancelada" },
  { id: "4", colaborador_id: "eu", data: "2026-08-30", status: "prevista" },
  { id: "5", colaborador_id: "outro", data: "2026-09-27", status: "prevista" },
];

describe("folgasOfertaveis", () => {
  it("traz só minhas folgas ativas de hoje em diante, em ordem", () => {
    const r = folgasOfertaveis(folgas, { meuId: "eu", hojeIso: "2026-09-06" });
    expect(r.map((f) => f.data)).toEqual(["2026-09-06", "2026-09-13"]);
  });

  it("exclui o próprio dia pedido na troca", () => {
    const r = folgasOfertaveis(folgas, {
      meuId: "eu",
      hojeIso: "2026-09-06",
      diaPedidoIso: "2026-09-13",
    });
    expect(r.map((f) => f.data)).toEqual(["2026-09-06"]);
  });

  it("retorna vazio sem colaborador", () => {
    expect(folgasOfertaveis(folgas, { meuId: null, hojeIso: "2026-09-06" })).toEqual([]);
  });
});

describe("trocaInconsistente", () => {
  it("marca mesma data nos dois lados", () => {
    expect(
      trocaInconsistente({ data_original: "2026-07-02", data_proposta: "2026-07-02" }),
    ).toBe(true);
  });

  it("marca a mesma pessoa nos dois lados", () => {
    expect(
      trocaInconsistente({
        data_original: "2026-07-02",
        data_proposta: "2026-07-09",
        solicitante_id: "a",
        destino_id: "a",
      }),
    ).toBe(true);
  });

  it("aceita troca válida", () => {
    expect(
      trocaInconsistente({
        data_original: "2026-07-02",
        data_proposta: "2026-07-09",
        solicitante_id: "a",
        destino_id: "b",
      }),
    ).toBe(false);
  });
});
