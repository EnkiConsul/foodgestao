import { describe, expect, it } from "vitest";
import { casaBusca, fatiar, nomeEmpresa, podeConfirmarDecisao, resumoErros } from "@/lib/admin/auditoriaErros";

describe("auditoria de erros", () => {
  it("fatia 300 ids em lotes de no máximo 40", () => {
    const fatias = fatiar(Array.from({ length: 300 }, (_, i) => `id-${i}`));
    expect(fatias).toHaveLength(8);
    expect(Math.max(...fatias.map((f) => f.length))).toBe(40);
    expect(fatias.flat()).toHaveLength(300);
  });

  it("resumo conta abertos, novos em 24h, chamados pendentes e ocorrências", () => {
    const agora = new Date("2026-11-12T13:00:00Z").getTime();
    const r = resumoErros([
      { status: "aberto", first_seen_at: "2026-11-12T10:00:00Z", occurrences: 2, reports: [{ status: "aberto" }] },
      { status: "aberto", first_seen_at: "2026-11-01T10:00:00Z", occurrences: 3, reports: [{ status: "resolvido" }] },
      { status: "resolvido", first_seen_at: "2026-11-12T12:00:00Z", occurrences: 11, reports: [{ status: "em_analise" }] },
    ], agora);
    expect(r).toEqual({ abertos: 2, novos24h: 1, comChamados: 2, ocorrencias: 16 });
  });

  it("nome da empresa usa o nome fantasia antes da razão social", () => {
    expect(nomeEmpresa({ name: "BAR PRAIANOS LTDA", trade_name: "Praianos" })).toBe("Praianos");
    expect(nomeEmpresa({ name: "BAR PRAIANOS LTDA", trade_name: " " })).toBe("BAR PRAIANOS LTDA");
    expect(nomeEmpresa(null)).toBeNull();
  });

  it("busca encontra pela empresa e pelo CNPJ com ou sem pontuação", () => {
    expect(casaBusca(["Meu calendário", "Praianos"], "praianos")).toBe(true);
    expect(casaBusca(["Meu calendário"], "50.671.376", "50671376000104")).toBe(true);
    expect(casaBusca(["Meu calendário"], "rancho", "50671376000104")).toBe(false);
  });

  it("ignorar em lote exige justificativa; resolver não", () => {
    expect(podeConfirmarDecisao("ignorado", "  ", 3)).toBe(false);
    expect(podeConfirmarDecisao("ignorado", "aviso esperado", 3)).toBe(true);
    expect(podeConfirmarDecisao("resolvido", "", 2)).toBe(true);
    expect(podeConfirmarDecisao("resolvido", "", 0)).toBe(false);
  });
});
