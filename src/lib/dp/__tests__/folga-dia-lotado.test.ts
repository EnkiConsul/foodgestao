import { describe, expect, it } from "vitest";
import { mensagemPedidoDiaLotado, pedidoDiaLotadoNoMes, temFimDeSemanaAposAdmissao } from "../folga-dia-lotado";

describe("pedido da folga do mês em dia lotado", () => {
  const pendentes = [
    { id: "a", colaborador_id: "eu", data_alvo: "2026-11-29", excede_limite_dia: true },
    { id: "b", colaborador_id: "eu", data_alvo: "2026-11-20", excede_limite_dia: false },
    { id: "c", colaborador_id: "outro", data_alvo: "2026-11-28", excede_limite_dia: true },
  ];

  it("acha o meu pedido do dia lotado em qualquer dia do mesmo mês", () => {
    expect(pedidoDiaLotadoNoMes(pendentes, "eu", "2026-11-22")?.id).toBe("a");
  });

  it("ignora pedidos comuns, de colegas e de outro mês", () => {
    expect(pedidoDiaLotadoNoMes(pendentes, "eu", "2026-12-05")).toBeNull();
    expect(pedidoDiaLotadoNoMes(pendentes.slice(1), "eu", "2026-11-22")).toBeNull();
  });

  it("explica o pedido já feito com a data do pedido", () => {
    expect(mensagemPedidoDiaLotado("FOLGA_MES_PEDIDO_PENDENTE: 29/11/2026")).toContain("29/11/2026");
  });
});

describe("admitido durante o mês", () => {
  it("admitido antes do último fim de semana ainda tem folga de fim de semana no mês", () => {
    // 23/11/2026 é segunda; 28 e 29 são sábado e domingo.
    expect(temFimDeSemanaAposAdmissao("2026-11-23", "2026-11-01", "2026-11-30")).toBe(true);
  });

  it("admitido depois do último sábado e domingo do mês não fica com folga em aberto", () => {
    expect(temFimDeSemanaAposAdmissao("2026-11-30", "2026-11-01", "2026-11-30")).toBe(false);
  });

  it("sem data de admissão vale o mês inteiro", () => {
    expect(temFimDeSemanaAposAdmissao(null, "2026-11-01", "2026-11-30")).toBe(true);
  });
});
