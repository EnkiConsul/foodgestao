import { describe, expect, it } from "vitest";
import { diasAjustadosPeloGestor, diasNumero, limitarDias } from "@/lib/dp/vale-dias";
import { calcularVaDeposito, diferencaCicloAnterior } from "@/lib/dp/va-calculo";

describe("limitarDias", () => {
  it("aceita número inteiro dentro do limite", () => {
    expect(limitarDias("26")).toEqual({ valor: "26", erro: null });
    expect(limitarDias("0")).toEqual({ valor: "0", erro: null });
    expect(limitarDias("31")).toEqual({ valor: "31", erro: null });
  });

  it("recusa acima de 31 com aviso claro", () => {
    const r = limitarDias("45");
    expect(r.valor).toBe("31");
    expect(r.erro).toBe("Informe de 0 a 31 dias.");
  });

  it("ignora letras e permite apagar o campo", () => {
    expect(limitarDias("a2b")).toEqual({ valor: "2", erro: null });
    expect(limitarDias("")).toEqual({ valor: "", erro: null });
  });
});

describe("diasAjustadosPeloGestor", () => {
  it("marca ajuste quando difere do calculado ou está vazio", () => {
    expect(diasAjustadosPeloGestor("24", 26)).toBe(true);
    expect(diasAjustadosPeloGestor("", 26)).toBe(true);
  });

  it("não marca ajuste quando é igual ao calculado", () => {
    expect(diasAjustadosPeloGestor("26", 26)).toBe(false);
  });
});

describe("total com dias informados pelo gestor", () => {
  it("usa os dias informados no lugar do calculado", () => {
    const diferenca = diferencaCicloAnterior(20, 22);
    const deposito = calcularVaDeposito({
      diasPrevistos: diasNumero("24"),
      diasDescontados: 0,
      diferencaAnterior: diferenca,
      valorDia: 24,
      descontoColaborador: 0,
    });
    expect(diferenca).toBe(2);
    expect(deposito.diasPagos).toBe(26);
    expect(deposito.depositar).toBe(624);
  });
});
