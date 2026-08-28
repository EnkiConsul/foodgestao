import { describe, it, expect } from "vitest";
import {
  classifyCardLine,
  isCardChargeLine,
  isCardBillMovement,
  splitInstallment,
  stripAggregatorPrefix,
} from "@/lib/conciliacao/cardLine";

describe("classifyCardLine — padronização entre bancos", () => {
  it("Neon: colunas com nome, cidade e país", () => {
    const line = classifyCardLine({
      description: "ModernMarket GOIANIA BR",
      raw: { descriptionRaw: "ModernMarket             GOIANIA      BR" },
    });
    expect(line.kind).toBe("compra");
    expect(line.merchant).toBe("ModernMarket");
    expect(line.city).toBe("GOIANIA");
  });

  it("Neon: país colado ao conector da cidade", () => {
    expect(
      classifyCardLine({ description: "SORVETERIA MEGA GELATT Valparaiso deBR" }).merchant,
    ).toBe("SORVETERIA MEGA GELATT");
  });

  it("remove prefixo de adquirente", () => {
    expect(classifyCardLine({ description: "MP *VOXALIMENTOS GOIANIA BR" }).merchant).toBe(
      "VOXALIMENTOS",
    );
    expect(classifyCardLine({ description: "DL*GOOGLE R10 Sc SAO PAULO BR" }).merchant).toBe(
      "GOOGLE R10 Sc",
    );
    expect(stripAggregatorPrefix("TRADIO *MILLANO LANCH")).toBe("MILLANO LANCH");
  });

  it("Nubank: parcela fora do nome do fornecedor", () => {
    const a = classifyCardLine({ description: "Ipremium Store 2/3" });
    const b = classifyCardLine({ description: "Ipremium Store 3/3" });
    expect(a.merchant).toBe("Ipremium Store");
    expect(b.merchant).toBe("Ipremium Store");
    expect(a.installment).toEqual({ current: 2, total: 3 });
    expect(splitInstallment("LOJA X PARC 02/06").installment).toEqual({ current: 2, total: 6 });
  });

  it("Nubank: encargos não são fornecedor", () => {
    for (const t of [
      "Juros de atraso",
      "Multa de atraso",
      "IOF de atraso",
      "IOF de compra internacional",
      "Saldo em atraso",
      "Juros de dívida encerrada",
      "IOF - GARMIN",
    ]) {
      const line = classifyCardLine({ description: t });
      expect(line.kind, t).toBe("encargo");
      expect(line.merchant, t).toBeNull();
    }
    expect(isCardChargeLine("Anuidade diferenciada")).toBe(true);
  });

  it("movimentos da própria fatura", () => {
    for (const t of [
      "Pagamento recebido",
      "Pagamento Fatura",
      "Encerramento de dívida",
      "Crédito de atraso",
      "Estorno de compra",
    ]) {
      expect(classifyCardLine({ description: t }).kind, t).toBe("pagamento_fatura");
    }
    expect(isCardBillMovement("Qualquer", "Credit card payment")).toBe(true);
  });

  it("BMG: código genérico fica sem identificação", () => {
    const line = classifyCardLine({ description: "CREDITO_A_VISTA" });
    expect(line.kind).toBe("sem_identificacao");
    expect(line.merchant).toBeNull();
  });

  it("merchant estruturado tem prioridade", () => {
    expect(
      classifyCardLine({ description: "DROGASIL 2519 GOIANIA BR", merchantName: "Drogasil S.A." })
        .merchant,
    ).toBe("Drogasil S.A.");
  });

  it("texto vazio", () => {
    expect(classifyCardLine({ description: null }).kind).toBe("sem_identificacao");
  });
});
