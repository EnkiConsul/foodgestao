import { describe, it, expect } from "vitest";
import {
  formaPagamentoPadrao,
  permiteAdiantamento,
  remuneracaoPendente,
  salarioBaseEfetivo,
  valeTransporteDoMes,
  valorAdicional,
  valorHoraEfetivo,
} from "../remuneracao";

describe("forma de pagamento", () => {
  it("sugere horista para intermitente e mensalista para CLT", () => {
    expect(formaPagamentoPadrao("intermitente")).toBe("horista");
    expect(formaPagamentoPadrao("clt")).toBe("mensalista");
  });

  it("libera adiantamento apenas para CLT mensalista", () => {
    expect(permiteAdiantamento("clt", "mensalista")).toBe(true);
    expect(permiteAdiantamento("clt", "horista")).toBe(false);
    expect(permiteAdiantamento("intermitente", "horista")).toBe(false);
    expect(permiteAdiantamento("pj", "mensalista")).toBe(false);
  });
});

describe("salário e valor-hora", () => {
  it("usa o salário do cargo quando o colaborador não tem valor próprio", () => {
    expect(salarioBaseEfetivo({ salario_base: null, salario_cargo: 2200 })).toBe(2200);
    expect(salarioBaseEfetivo({ salario_base: 3000, salario_cargo: 2200 })).toBe(3000);
    expect(salarioBaseEfetivo({})).toBeNull();
  });

  it("aplica o divisor CLT para mensalista", () => {
    expect(valorHoraEfetivo({ forma_pagamento: "mensalista", salario_base: 2200 }, 44)).toBeCloseTo(10, 5);
  });

  it("usa o valor da hora cadastrado para horista", () => {
    expect(valorHoraEfetivo({ forma_pagamento: "horista", valor_hora: 18.5 })).toBe(18.5);
    expect(valorHoraEfetivo({ forma_pagamento: "horista", valor_hora: 0, salario_base: 2200 })).toBeUndefined();
  });

  it("converte o valor do dia em valor-hora para diarista", () => {
    // carga 44h/sem → 8,8h/dia
    expect(valorHoraEfetivo({ forma_pagamento: "diarista", salario_base: 176 }, 44)).toBeCloseTo(20, 5);
  });
});

describe("adicional e vale-transporte", () => {
  it("calcula o adicional percentual", () => {
    expect(valorAdicional(2000, 30)).toBe(600);
    expect(valorAdicional(2000, 0)).toBe(0);
    expect(valorAdicional(2000, 999)).toBe(2000);
  });

  it("limita o desconto do vale-transporte a 6% do salário", () => {
    const vt = valeTransporteDoMes({ vale_transporte: true, vale_transporte_valor_dia: 10, salario_base: 2000 }, 22);
    expect(vt.bruto).toBe(220);
    expect(vt.desconto).toBe(120);
    expect(vt.liquido).toBe(100);
  });

  it("nunca desconta mais do que o valor concedido", () => {
    const vt = valeTransporteDoMes({ vale_transporte: true, vale_transporte_valor_dia: 1, salario_base: 5000 }, 22);
    expect(vt.desconto).toBe(22);
    expect(vt.liquido).toBe(0);
  });

  it("zera quando o colaborador não opta", () => {
    expect(valeTransporteDoMes({ vale_transporte: false, vale_transporte_valor_dia: 10 })).toEqual({
      bruto: 0,
      desconto: 0,
      liquido: 0,
    });
  });
});

describe("pendência de remuneração", () => {
  it("aponta o motivo por forma de pagamento", () => {
    expect(remuneracaoPendente({ forma_pagamento: "horista" })).toMatch(/hora/i);
    expect(remuneracaoPendente({ forma_pagamento: "diarista" })).toMatch(/dia/i);
    expect(remuneracaoPendente({ forma_pagamento: "mensalista" })).toMatch(/salário/i);
  });

  it("não aponta pendência quando há valor", () => {
    expect(remuneracaoPendente({ forma_pagamento: "horista", valor_hora: 15 })).toBeNull();
    expect(remuneracaoPendente({ forma_pagamento: "mensalista", salario_cargo: 1500 })).toBeNull();
  });
});
