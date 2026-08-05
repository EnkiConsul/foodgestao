import { describe, expect, it } from "vitest";
import {
  ORDER_STATUSES,
  canTransition,
  isOrderOpen,
  isOrderFinal,
  operationForStatus,
  itemTotalCents,
  orderTotalsCents,
} from "@/lib/orders/orders";

describe("máquina de estados de pedidos", () => {
  it("possui os 13 estados canônicos", () => {
    expect(ORDER_STATUSES).toHaveLength(13);
  });

  it("aceita transições válidas", () => {
    expect(canTransition("pending_acceptance", "accepted")).toBe(true);
    expect(canTransition("accepted", "preparation_started")).toBe(true);
    expect(canTransition("preparation_started", "ready")).toBe(true);
    expect(canTransition("ready", "awaiting_pickup")).toBe(true);
    expect(canTransition("ready", "dispatched")).toBe(true);
    expect(canTransition("dispatched", "delivered")).toBe(true);
    expect(canTransition("delivered", "completed")).toBe(true);
    expect(canTransition("pending_acceptance", "cancelled")).toBe(true);
    expect(canTransition("accepted", "cancellation_requested")).toBe(true);
    expect(canTransition("cancellation_requested", "cancelled")).toBe(true);
  });

  it("rejeita transições arbitrárias", () => {
    expect(canTransition("pending_acceptance", "delivered")).toBe(false);
    expect(canTransition("pending_acceptance", "completed")).toBe(false);
    expect(canTransition("completed", "accepted")).toBe(false);
    expect(canTransition("refunded", "completed")).toBe(false);
    expect(canTransition("failed", "accepted")).toBe(false);
    expect(canTransition("cancelled", "accepted")).toBe(false);
  });

  it("classifica pedidos abertos e finais", () => {
    expect(isOrderOpen("preparation_started")).toBe(true);
    expect(isOrderOpen("completed")).toBe(false);
    expect(isOrderFinal("refunded")).toBe(true);
    expect(isOrderFinal("completed")).toBe(true);
    expect(isOrderFinal("ready")).toBe(false);
  });

  it("mapeia a permissão exigida por estado", () => {
    expect(operationForStatus("accepted")).toBe("orders.accept");
    expect(operationForStatus("ready")).toBe("orders.prepare");
    expect(operationForStatus("dispatched")).toBe("orders.dispatch");
    expect(operationForStatus("cancelled")).toBe("orders.cancel");
    expect(operationForStatus("refunded")).toBe("orders.refund");
    expect(operationForStatus("completed")).toBe("orders.manage");
  });
});

describe("totais do pedido (centavos)", () => {
  it("soma item com complementos por unidade", () => {
    expect(itemTotalCents({ unitPrice: 2500, quantity: 2, optionsPrice: 300 })).toBe(5600);
  });

  it("calcula subtotal, taxas e desconto", () => {
    const t = orderTotalsCents({
      items: [
        { unitPrice: 2500, quantity: 2, optionsPrice: 300 },
        { unitPrice: 1000, quantity: 1 },
      ],
      deliveryFee: 700,
      serviceFee: 100,
      discount: 600,
    });
    expect(t.subtotal).toBe(6600);
    expect(t.total).toBe(6800);
  });

  it("limita desconto ao valor do pedido", () => {
    const t = orderTotalsCents({ items: [{ unitPrice: 1000, quantity: 1 }], discount: 99999 });
    expect(t.discount).toBe(1000);
    expect(t.total).toBe(0);
  });
});
