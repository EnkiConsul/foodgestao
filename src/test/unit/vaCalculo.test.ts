import { describe, it, expect } from "vitest";
import {
  periodoVaDe,
  contarDiasPrevistos,
  contarDiasDescontaveis,
  calcularVaDeposito,
  REGRAS_DESCONTO_PADRAO,
} from "@/lib/dp/va-calculo";

describe("periodoVaDe", () => {
  it("fecha o cálculo 5 dias antes do pagamento", () => {
    const p = periodoVaDe(25, 5, "2026-08-01");
    expect(p.pagamento).toBe("2026-08-25");
    expect(p.corte).toBe("2026-08-20");
    expect(p.cobertura).toEqual({ inicio: "2026-08-21", fim: "2026-09-20" });
    expect(p.conferencia).toEqual({ inicio: "2026-07-21", fim: "2026-08-20" });
  });

  it("usa padrões quando a empresa não informou", () => {
    const p = periodoVaDe(null, null, "2026-03-01");
    expect(p.pagamento).toBe("2026-03-25");
    expect(p.corte).toBe("2026-03-20");
  });

  it("ajusta dia de pagamento maior que o mês", () => {
    expect(periodoVaDe(31, 0, "2026-02-01").pagamento).toBe("2026-02-28");
  });
});

describe("contarDiasPrevistos", () => {
  const periodo = { inicio: "2026-08-21", fim: "2026-08-31" };

  it("usa a jornada habitual e retira folgas marcadas", () => {
    const r = contarDiasPrevistos({
      periodo,
      dowTrabalhados: [1, 2, 3, 4, 5, 6],
      folgas: [
        { data: "2026-08-24", tipo: "extra", status: "realizada" },
        { data: "2026-08-26", tipo: "normal", status: "agendada" },
        { data: "2026-08-28", tipo: "normal", status: "cancelada" },
      ],
    });
    // 21..31 tem 9 dias úteis (exclui domingos 23 e 30); menos 2 folgas válidas.
    expect(r.dias).toBe(7);
    expect(r.folgasDescontadas).toBe(2);
    expect(r.folgasPendentes).toBe(0);
    expect(r.origem).toBe("jornada");
  });

  it("prefere a escala publicada", () => {
    const r = contarDiasPrevistos({
      periodo,
      dowTrabalhados: [1, 2, 3, 4, 5],
      escala: [
        { data: "2026-08-21", tipo: "trabalho" },
        { data: "2026-08-22", tipo: "trabalho" },
        { data: "2026-08-23", tipo: "folga" },
      ],
    });
    expect(r.dias).toBe(2);
    expect(r.origem).toBe("escala");
  });

  it("usa convocações distintas para intermitente sem fallback de jornada", () => {
    const r = contarDiasPrevistos({
      periodo,
      datasPrevistas: ["2026-08-21", "2026-08-21", "2026-08-23"],
      origemDatasPrevistas: "convocacao",
      dowTrabalhados: [1, 2, 3, 4, 5],
    });
    expect(r.dias).toBe(2);
    expect(r.origem).toBe("convocacao");
  });

  it("intermitente sem convocação fica com zero dias", () => {
    const r = contarDiasPrevistos({
      periodo,
      datasPrevistas: [],
      origemDatasPrevistas: "convocacao",
      dowTrabalhados: [1, 2, 3, 4, 5],
    });
    expect(r.dias).toBe(0);
    expect(r.origem).toBe("convocacao");
  });

  it("retira férias do próximo período sem contar duas vezes uma folga", () => {
    const r = contarDiasPrevistos({
      periodo,
      dowTrabalhados: [1, 2, 3, 4, 5, 6],
      folgas: [{ data: "2026-08-24", tipo: "normal", status: "agendada" }],
      ferias: [{ inicio: "2026-08-24", fim: "2026-08-26" }],
    });
    expect(r.folgasDescontadas).toBe(1);
    expect(r.feriasDescontadas).toBe(2);
    expect(r.dias).toBe(6);
  });
});

describe("contarDiasDescontaveis", () => {
  const base = {
    periodo: { inicio: "2026-07-21", fim: "2026-08-20" },
    diasPrevistos: ["2026-07-22", "2026-07-23", "2026-07-24"],
    regras: REGRAS_DESCONTO_PADRAO,
  };

  it("conta folga extra e falta sem ponto", () => {
    const r = contarDiasDescontaveis({
      ...base,
      usaPonto: true,
      diasComPonto: ["2026-07-23"],
      folgas: [{ data: "2026-07-22", tipo: "extra", status: "realizada" }],
    });
    expect(r.porMotivo.folga_extra).toBe(1);
    expect(r.porMotivo.falta).toBe(1); // 24 sem ponto
    expect(r.dias).toBe(2);
  });

  it("ignora atestado quando a empresa não desconta", () => {
    const r = contarDiasDescontaveis({
      ...base,
      folgas: [{ data: "2026-07-22", tipo: "licenca", status: "realizada" }],
    });
    expect(r.dias).toBe(0);
  });

  it("não acusa falta quando a empresa não controla ponto", () => {
    const r = contarDiasDescontaveis({ ...base, usaPonto: false });
    expect(r.dias).toBe(0);
  });
});

describe("calcularVaDeposito", () => {
  it("desconta os dias não trabalhados do período anterior", () => {
    const r = calcularVaDeposito({
      diasPrevistos: 26,
      diasDescontados: 3,
      valorDia: 24,
      descontoColaborador: 10,
    });
    expect(r.diasPagos).toBe(23);
    expect(r.bruto).toBe(552);
    expect(r.depositar).toBe(542);
  });

  it("respeita o ajuste manual do gestor", () => {
    const r = calcularVaDeposito({ diasPrevistos: 26, diasDescontados: 3, valorDia: 10, diasAjustados: 20 });
    expect(r.diasPagos).toBe(20);
    expect(r.depositar).toBe(200);
  });
});
