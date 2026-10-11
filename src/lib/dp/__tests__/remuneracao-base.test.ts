import { describe, it, expect } from "vitest";
import {
  valorHoraPorBase,
  valorDiaPorBase,
  premioAssiduidadeDevido,
} from "../remuneracao";

describe("base de cálculo do valor da hora/dia", () => {
  it("divide a base salarial pela base de horas", () => {
    expect(valorHoraPorBase(2200, 220)).toBe(10);
    expect(valorHoraPorBase(2200, 200)).toBe(11);
  });

  it("divide a base salarial pela base de dias", () => {
    expect(valorDiaPorBase(3000, 30)).toBe(100);
  });

  it("retorna null com dados incompletos", () => {
    expect(valorHoraPorBase(0, 220)).toBeNull();
    expect(valorHoraPorBase(2200, 0)).toBeNull();
    expect(valorDiaPorBase(null, 30)).toBeNull();
  });
});

describe("prêmio de assiduidade", () => {
  const base = { premio_assiduidade: true, premio_assiduidade_valor: 150 };

  it("não paga quando o prêmio está desligado", () => {
    expect(premioAssiduidadeDevido({ premio_assiduidade: false, premio_assiduidade_valor: 150 }, { faltas: 0, atrasos: 0 })).toBe(0);
  });

  it("qualquer ocorrência que o gestor decidiu descontar tira o prêmio do mês", () => {
    expect(premioAssiduidadeDevido(base, { faltas: 0, atrasos: 0 })).toBe(150);
    expect(premioAssiduidadeDevido(base, { faltas: 0, atrasos: 1 })).toBe(0);
    expect(premioAssiduidadeDevido(base, { faltas: 1, atrasos: 0 })).toBe(0);
    expect(premioAssiduidadeDevido(base, { faltas: 0, atrasos: 0, atestados: 1, atestadosAbonados: 1 })).toBe(150);
  });
});
