import { describe, expect, it } from "vitest";
import {
  competenciaEfeito,
  optanteNaCompetencia,
  situacaoAtual,
  validarSolicitacaoPortal,
} from "@/lib/dp/adiantamento-opcao";
import { elegivelDocumento } from "@/lib/dp/pendencias-documentos";

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

  it("portal recusa apenas data retroativa", () => {
    expect(validarSolicitacaoPortal("2026-07-01", 15, "2026-07-05")).toMatch(/retroativa/i);
    expect(validarSolicitacaoPortal("2026-07-12", 15, "2026-07-05")).toBeNull();
    expect(validarSolicitacaoPortal("2026-07-08", 15, "2026-07-05")).toBeNull();
  });

  it("pedido do portal tem carência de 30 dias", () => {
    // 01/07 + 30 dias = 31/07 → depois do dia 15 de julho → agosto.
    expect(competenciaEfeito("2026-07-01", 15, "portal")).toBe("2026-08");
    // 20/06 + 30 dias = 20/07 → depois do dia 15 → agosto.
    expect(competenciaEfeito("2026-06-20", 15, "portal")).toBe("2026-08");
    // 10/07 + 30 dias = 09/08 → antes do dia 25 de agosto → agosto.
    expect(competenciaEfeito("2026-07-10", 25, "portal")).toBe("2026-08");
    // Gestor segue sem carência.
    expect(competenciaEfeito("2026-07-01", 15, "gestor")).toBe("2026-07");
  });
});

describe("elegibilidade de adiantamento por admissão/desligamento", () => {
  const base = { id: "c1", regime: "clt", optante_adiantamento: true } as const;

  it("admitido depois do dia do pagamento não deve adiantamento no mês", () => {
    expect(
      elegivelDocumento("adiantamento", { ...base, data_admissao: "2026-07-29" }, {
        competencia: "2026-07",
        diaAdiantamento: 15,
      }),
    ).toBe(false);
    // Competência seguinte já é cobrada.
    expect(
      elegivelDocumento("adiantamento", { ...base, data_admissao: "2026-07-29" }, {
        competencia: "2026-08",
        diaAdiantamento: 15,
      }),
    ).toBe(true);
  });

  it("admitido no dia do pagamento ou antes segue elegível", () => {
    for (const dia of ["2026-07-01", "2026-07-15"]) {
      expect(
        elegivelDocumento("adiantamento", { ...base, data_admissao: dia }, {
          competencia: "2026-07",
          diaAdiantamento: 15,
        }),
      ).toBe(true);
    }
  });

  it("mantém a regra do desligamento antes do dia do pagamento", () => {
    expect(
      elegivelDocumento("adiantamento", { ...base, data_admissao: "2025-01-10", data_desligamento: "2026-07-02" }, {
        competencia: "2026-07",
        diaAdiantamento: 15,
      }),
    ).toBe(false);
    expect(
      elegivelDocumento("adiantamento", { ...base, data_admissao: "2025-01-10", data_desligamento: "2026-07-20" }, {
        competencia: "2026-07",
        diaAdiantamento: 15,
      }),
    ).toBe(true);
  });
});
