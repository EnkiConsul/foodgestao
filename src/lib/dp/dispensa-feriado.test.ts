import { describe, it, expect } from "vitest";
import { segueConvocado, textoTermoDispensaFeriado, montarMotivoPedidoDispensa } from "./dispensa-feriado";

describe("pedido de dispensa de feriado", () => {
  it("sem resposta ou recusado, continua convocado", () => {
    expect(segueConvocado("pendente")).toBe(true);
    expect(segueConvocado("recusada")).toBe(true);
    expect(segueConvocado(null)).toBe(true);
    expect(segueConvocado("aprovada")).toBe(false);
  });
  it("termo deixa claro que o pedido não autoriza a falta", () => {
    const t = textoTermoDispensaFeriado("Natal", "25/12");
    expect(t).toContain("NÃO me autoriza a faltar");
    expect(t).toContain("Se o gestor não responder");
  });
  it("exige assinatura com nome", () => {
    expect(() => montarMotivoPedidoDispensa({ nomeFeriado: "Natal", justificativa: "viagem familiar", assinatura: "", aceitoEm: "x" })).toThrow();
  });
});

import { ehPedidoDispensaFeriado, validarRecusaDispensa } from "./dispensa-feriado";
describe("aprovação da dispensa", () => {
  it("reconhece o pedido do portal", () => {
    expect(ehPedidoDispensaFeriado("Dispensa em Feriado (Natal) — a pedido do colaborador · x")).toBe(true);
    expect(ehPedidoDispensaFeriado("Dispensa em Feriado (Natal) — liberalidade da empresa")).toBe(false);
  });
  it("recusa sem motivo é barrada", () => {
    expect(() => validarRecusaDispensa("  ")).toThrow();
    expect(validarRecusaDispensa(" Loja cheia ")).toBe("Loja cheia");
  });
});
