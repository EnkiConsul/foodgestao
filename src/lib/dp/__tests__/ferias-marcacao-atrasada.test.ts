import { describe, expect, it } from "vitest";
import { alertaPendenciaFerias, nivelVencimentoPeriodo } from "@/lib/dp/ferias-direito";

/**
 * Quando o prazo legal restante é menor ou igual aos dias que a pessoa ainda
 * tem para gozar, não cabe mais o descanso inteiro: a marcação está atrasada.
 */
describe("marcação de férias atrasada pelo saldo x prazo", () => {
  const base = {
    fimAquisitivo: "2025-09-30",
    limiteConcessivo: "2026-09-30",
    hojeISO: "2026-09-11",
    politica: "a_conceder" as const,
  };

  it("prazo maior que o saldo não vira marcação atrasada", () => {
    const nivel = nivelVencimentoPeriodo({
      ...base,
      limiteConcessivo: "2027-06-30",
      diasSaldo: 30,
    });
    expect(nivel).not.toBe("marcacao_atrasada");
  });

  it("prazo igual ao saldo já está atrasado", () => {
    // faltam 19 dias e há 19 dias a gozar
    expect(
      nivelVencimentoPeriodo({ ...base, limiteConcessivo: "2026-09-30", diasSaldo: 19 }),
    ).toBe("marcacao_atrasada");
  });

  it("prazo menor que o saldo já está atrasado", () => {
    expect(
      nivelVencimentoPeriodo({ ...base, limiteConcessivo: "2026-09-30", diasSaldo: 30 }),
    ).toBe("marcacao_atrasada");
  });

  it("saldo zero não gera marcação atrasada", () => {
    expect(
      nivelVencimentoPeriodo({ ...base, limiteConcessivo: "2026-09-30", diasSaldo: 0 }),
    ).not.toBe("marcacao_atrasada");
  });

  it("sócio continua fora da cobrança de prazo", () => {
    expect(
      nivelVencimentoPeriodo({ ...base, diasSaldo: 30, socio: true }),
    ).toBe("normal");
  });

  it("prazo vencido continua como vencido", () => {
    expect(
      nivelVencimentoPeriodo({ ...base, limiteConcessivo: "2026-08-31", diasSaldo: 30 }),
    ).toBe("vencido");
  });

  it("alerta explica prazo e saldo", () => {
    const alerta = alertaPendenciaFerias({ ...base, diasSaldo: 30 });
    expect(alerta.nivel).toBe("marcacao_atrasada");
    expect(alerta.titulo).toBe("Férias — marcação atrasada");
    expect(alerta.detalhePrazo).toContain("30 dia(s) a gozar");
  });
});
