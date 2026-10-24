import { describe, expect, it, vi } from "vitest";
import { aplicarTipoOcorrencia } from "@/lib/dp/ocorrencias-filtro";

function consulta() {
  const q = { or: vi.fn(), eq: vi.fn() };
  q.or.mockReturnValue(q);
  q.eq.mockReturnValue(q);
  return q;
}

describe("filtro de origem das ocorrências", () => {
  it("seleciona folgas compensatórias, extras e os dois lados das trocas pelos vínculos", () => {
    const q = consulta();
    expect(aplicarTipoOcorrencia(q, "folgas_trocas")).toBe(q);
    expect(q.or).toHaveBeenCalledExactlyOnceWith("folga_id.not.is.null,troca_id.not.is.null");
    expect(q.eq).not.toHaveBeenCalled();
  });

  it("todas não restringe tipo nem origem", () => {
    const q = consulta();
    aplicarTipoOcorrencia(q, "all");
    expect(q.or).not.toHaveBeenCalled();
    expect(q.eq).not.toHaveBeenCalled();
  });

  it("preserva o filtro de faltas sem misturar justificativas de folga", () => {
    const q = consulta();
    aplicarTipoOcorrencia(q, "falta");
    expect(q.eq).toHaveBeenCalledExactlyOnceWith("tipo", "falta");
    expect(q.or).not.toHaveBeenCalled();
  });
});