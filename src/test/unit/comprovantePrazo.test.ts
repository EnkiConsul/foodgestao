import { describe, expect, it } from "vitest";
import { pagamentoPrevisto, prazoComprovante } from "@/lib/dp/comprovante-prazo";

describe("prazo do comprovante de pagamento", () => {
  it("adiantamento usa o dia de pagamento da unidade", () => {
    expect(
      pagamentoPrevisto({ tipo: "adiantamento", referencia: "2026-09-01", diaAdiantamento: 15, diaPagamentoFolha: 5 }),
    ).toBe("2026-09-15");
    expect(
      prazoComprovante({
        tipo: "adiantamento",
        referencia: "2026-09-01",
        diaAdiantamento: 15,
        diaPagamentoFolha: 5,
        toleranciaDias: 5,
      }),
    ).toBe("2026-09-20");
  });

  it("adiantamento sem dia cadastrado cai na data do documento", () => {
    expect(
      pagamentoPrevisto({ tipo: "adiantamento", referencia: "2026-09-10", diaAdiantamento: null, diaPagamentoFolha: 5 }),
    ).toBe("2026-09-10");
  });

  it("contracheque é pago no mês seguinte à competência", () => {
    expect(
      pagamentoPrevisto({ tipo: "contracheque", referencia: "2026-09-01", diaPagamentoFolha: 5 }),
    ).toBe("2026-10-05");
  });

  it("dia maior que o mês é ajustado para o último dia", () => {
    expect(
      pagamentoPrevisto({ tipo: "adiantamento", referencia: "2026-02-01", diaAdiantamento: 31, diaPagamentoFolha: 5 }),
    ).toBe("2026-02-28");
  });

  it("férias e rescisão usam a data do próprio documento", () => {
    expect(
      pagamentoPrevisto({ tipo: "recibo_ferias", referencia: "2026-09-22", diaPagamentoFolha: 5 }),
    ).toBe("2026-09-22");
    expect(
      pagamentoPrevisto({ tipo: "trct", referencia: "2026-09-09", diaPagamentoFolha: 5 }),
    ).toBe("2026-09-09");
  });
});
