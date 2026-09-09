import { describe, expect, it } from "vitest";
import {
  competenciaEfeito,
  optanteNaCompetencia,
  situacaoAtual,
  validarSolicitacaoPortal,
} from "@/lib/dp/adiantamento-opcao";

const sol = (tipo: "ativar" | "cancelar", data: string, dia = 15) => ({
  tipo,
  competencia_efeito: competenciaEfeito(data, dia),
  created_at: `${data}T10:00:00Z`,
});

describe("adiantamento por solicitações datadas", () => {
  it("antes do dia do pagamento vale na própria competência", () => {
    expect(competenciaEfeito("2026-07-10", 15)).toBe("2026-07");
  });

  it("no dia do pagamento ou depois vale na competência seguinte", () => {
    expect(competenciaEfeito("2026-07-15", 15)).toBe("2026-08");
    expect(competenciaEfeito("2026-12-20", 15)).toBe("2027-01");
  });

  it("lê a última solicitação válida da competência", () => {
    const hist = [sol("ativar", "2026-05-02"), sol("cancelar", "2026-07-01")];
    expect(optanteNaCompetencia(hist, "2026-05")).toBe(true);
    expect(optanteNaCompetencia(hist, "2026-06")).toBe(true);
    expect(optanteNaCompetencia(hist, "2026-07")).toBe(false);
  });

  it("sem histórico usa o cadastro como referência", () => {
    expect(optanteNaCompetencia([], "2026-07", true)).toBe(true);
    expect(optanteNaCompetencia([], "2026-07", false)).toBe(false);
  });

  it("situação atual olha a competência de hoje", () => {
    expect(situacaoAtual([sol("ativar", "2026-05-02")], "2026-09-10")).toBe(true);
  });

  it("portal recusa data retroativa e a janela de 5 dias", () => {
    expect(validarSolicitacaoPortal("2026-07-01", 15, "2026-07-05")).toMatch(/retroativa/i);
    expect(validarSolicitacaoPortal("2026-07-12", 15, "2026-07-05")).toMatch(/5 dias/);
    expect(validarSolicitacaoPortal("2026-07-08", 15, "2026-07-05")).toBeNull();
  });
});
