import { describe, expect, it } from "vitest";
import {
  competenciaEfeito,
  optanteNaCompetencia,
  prazoPortal,
  situacaoAtual,
  validarSolicitacaoPortal,
} from "@/lib/dp/adiantamento-opcao";
import { resumoRelacao, termoPendente } from "@/lib/dp/adiantamento-relacao";
import { mensagemAdiantamento } from "@/lib/dp/adiantamento-termo";
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

  it("pedido do portal vale no mês até (pagamento − antecedência) da unidade", () => {
    // Pagamento dia 20 e 5 dias de antecedência: prazo até 15/07.
    expect(competenciaEfeito("2026-07-15", 20, "portal", 5)).toBe("2026-07");
    expect(competenciaEfeito("2026-07-16", 20, "portal", 5)).toBe("2026-08");
    // Antecedência de 10 dias: prazo até 10/07.
    expect(competenciaEfeito("2026-07-10", 20, "portal", 10)).toBe("2026-07");
    expect(competenciaEfeito("2026-07-11", 20, "portal", 10)).toBe("2026-08");
    // Prazo que cai no mês anterior: pagamento dia 3, 5 dias → até 28/06 para julho.
    expect(competenciaEfeito("2026-06-28", 3, "portal", 5)).toBe("2026-07");
    expect(competenciaEfeito("2026-06-29", 3, "portal", 5)).toBe("2026-08");
  });

  it("gestor não tem antecedência", () => {
    expect(competenciaEfeito("2026-07-19", 20, "gestor")).toBe("2026-07");
    expect(competenciaEfeito("2026-07-20", 20, "gestor")).toBe("2026-08");
  });

  it("prazo do portal informa se ainda dá tempo para o próximo pagamento", () => {
    const dentro = prazoPortal("2026-07-12", 20, 5);
    expect(dentro).toMatchObject({ competencia: "2026-07", limite: "2026-07-15", pagamento: "2026-07-20", noProximoPagamento: true });
    const fora = prazoPortal("2026-07-17", 20, 5);
    expect(fora).toMatchObject({ competencia: "2026-08", competenciaProxima: "2026-07", noProximoPagamento: false });
  });

  it("antes da primeira solicitação o estado é o oposto do pedido", () => {
    // Quem pediu suspensão em agosto estava recebendo antes.
    expect(optanteNaCompetencia([sol("cancelar", "2026-08-02")], "2026-07", false)).toBe(true);
    expect(optanteNaCompetencia([sol("ativar", "2026-08-02")], "2026-07", true)).toBe(false);
  });

  it("ativação continua nos meses seguintes até a suspensão", () => {
    const hist = [sol("ativar", "2026-01-05")];
    expect(optanteNaCompetencia(hist, "2026-12")).toBe(true);
    expect(optanteNaCompetencia([...hist, sol("cancelar", "2026-12-20")], "2027-01")).toBe(false);
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

describe("relação de adiantamento", () => {
  it("suspensos não contam como quem recebe e termo pendente só de quem recebe", () => {
    const r = resumoRelacao([
      { situacao: "optante", termo_situacao: "assinado", salario_base: 2000 },
      { situacao: "nova_adesao", termo_situacao: "aguardando_assinatura", salario_base: 1800 },
      { situacao: "cancelado", termo_situacao: null, salario_base: 3000 },
    ]);
    expect(r).toEqual({ recebem: 2, novas: 1, suspensos: 1, termosPendentes: 1, salarios: 3800 });
  });

  it("termo em papel declarado pelo gestor não fica pendente", () => {
    expect(termoPendente("papel_existente")).toBe(false);
    expect(termoPendente("assinado_papel")).toBe(false);
    expect(termoPendente("aguardando_via")).toBe(true);
    expect(termoPendente("sem_termo")).toBe(true);
  });

  it("recusa do servidor vira frase pelo token", () => {
    expect(mensagemAdiantamento({ message: "ADIANTAMENTO_TERMO_PENDENTE: assine o termo." })).toMatch(/assine o termo/i);
    expect(mensagemAdiantamento({ message: "erro qualquer" })).toMatch(/não foi possível/i);
  });
});
