import { describe, expect, it } from "vitest";
import { motivoPermiteRecibo, quitacaoDiferenca, validarExcedente } from "@/lib/dp/comprovante-excedente";

describe("valor a maior no comprovante", () => {
  it("exige motivo", () => {
    expect(validarExcedente({ motivo: null, justificativa: "x".repeat(20), confirmado: true }).ok).toBe(false);
  });
  it("exige justificativa de 15 caracteres", () => {
    expect(validarExcedente({ motivo: "premio", justificativa: "curta demais", confirmado: true }).ok).toBe(false);
  });
  it("exige confirmação de responsabilidade", () => {
    expect(validarExcedente({ motivo: "premio", justificativa: "meta de vendas batida", confirmado: false }).ok).toBe(false);
  });
  it("aceita quando tudo foi informado", () => {
    expect(validarExcedente({ motivo: "premio", justificativa: "meta de vendas batida", confirmado: true }).ok).toBe(true);
  });
  it("engano exige forma de acerto e não gera recibo", () => {
    expect(validarExcedente({ motivo: "pago_por_engano", justificativa: "valor do mês anterior", confirmado: true }).ok).toBe(false);
    expect(motivoPermiteRecibo("pago_por_engano")).toBe(false);
  });
  it("misto atribui a diferença primeiro ao dinheiro", () => {
    expect(quitacaoDiferenca("misto", 10000, 30000)).toEqual({ modalidade: "especie", bancarioCents: null, especieCents: 10000 });
    expect(quitacaoDiferenca("misto", 10000, 4000)).toEqual({ modalidade: "misto", bancarioCents: 6000, especieCents: 4000 });
  });
});

import { sinalNatureza } from "@/lib/dp/comprovante-excedente";
import { describe as d2, it as i2, expect as e2 } from "vitest";
d2("estorno de pagamento a maior", () => {
  i2("estorno subtrai e novo pagamento soma ao total pago", () => {
    // Paguei 700 de um documento de 500; colaborador devolve 700 e pago 500.
    const total = 700 + sinalNatureza("estorno") * 700 + sinalNatureza("repagamento") * 500;
    e2(total).toBe(500);
    e2(700 + sinalNatureza("estorno") * 200).toBe(500);
  });
});
