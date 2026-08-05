import { describe, expect, it } from "vitest";
import {
  BOARD_COLUMNS,
  DEFAULT_DEADLINES,
  columnForStatus,
  maskAddress,
  maskPhone,
  minutesLeft,
  minutesSince,
  orderUrgency,
  pendenciesFor,
  primaryActionFor,
  shortCustomerName,
  timerLabel,
  type OrderLike,
} from "@/lib/orders/board";

const NOW = new Date("2026-08-05T12:00:00.000Z").getTime();
const minsAgo = (m: number) => new Date(NOW - m * 60_000).toISOString();

function order(partial: Partial<OrderLike> = {}): OrderLike {
  return {
    status: "pending_acceptance",
    order_type: "counter",
    payment_status: "paid",
    placed_at: minsAgo(1),
    ...partial,
  };
}

describe("colunas do quadro", () => {
  it("tem as 5 colunas operacionais", () => {
    expect(BOARD_COLUMNS.map((c) => c.id)).toEqual([
      "novos",
      "preparo",
      "prontos",
      "transporte",
      "concluidos",
    ]);
  });

  it("mapeia status para coluna", () => {
    expect(columnForStatus("pending_acceptance")).toBe("novos");
    expect(columnForStatus("preparation_started")).toBe("preparo");
    expect(columnForStatus("ready")).toBe("prontos");
    expect(columnForStatus("dispatched")).toBe("transporte");
    expect(columnForStatus("completed")).toBe("concluidos");
    expect(columnForStatus("cancelled")).toBeNull();
  });
});

describe("temporizadores", () => {
  it("calcula minutos decorridos e restantes", () => {
    expect(minutesSince(minsAgo(7), NOW)).toBe(7);
    expect(minutesSince(null, NOW)).toBe(0);
    expect(minutesLeft(minsAgo(2), 5, NOW)).toBe(3);
    expect(minutesLeft(minsAgo(9), 5, NOW)).toBe(-4);
  });

  it("usa prazos configuráveis, sem valor fixo de marketplace", () => {
    const o = order({ placed_at: minsAgo(4) });
    expect(timerLabel(o, { ...DEFAULT_DEADLINES, acceptMinutes: 10 }, NOW)).toBe("Aceitar em 6 min");
    expect(timerLabel(o, { ...DEFAULT_DEADLINES, acceptMinutes: 2 }, NOW)).toBe("Aceite atrasado 2 min");
  });

  it("mostra prazo de retirada para pedidos não-delivery", () => {
    const o = order({ status: "ready", order_type: "pickup", ready_at: minsAgo(3) });
    expect(timerLabel(o, DEFAULT_DEADLINES, NOW)).toBe("Retirada em 12 min");
  });
});

describe("pendências", () => {
  it("detecta cliente aguardando quando o aceite estoura", () => {
    const p = pendenciesFor(order({ placed_at: minsAgo(9) }), DEFAULT_DEADLINES, NOW);
    expect(p).toContain("customer_waiting");
  });

  it("detecta cancelamento, item indisponível e pagamento", () => {
    const p = pendenciesFor(
      order({ status: "cancellation_requested", payment_status: "failed", has_unavailable_item: true }),
      DEFAULT_DEADLINES,
      NOW,
    );
    expect(p).toEqual(expect.arrayContaining(["cancellation", "payment", "item_unavailable"]));
  });

  it("detecta atraso considerando tolerância", () => {
    const o = order({ status: "preparation_started", placed_at: minsAgo(45) });
    expect(pendenciesFor(o, DEFAULT_DEADLINES, NOW)).toContain("delay");
    expect(pendenciesFor(o, { ...DEFAULT_DEADLINES, prepMinutes: 60 }, NOW)).not.toContain("delay");
  });

  it("detecta entregador aguardando", () => {
    const o = order({ status: "ready", order_type: "delivery", courier_waiting: true });
    expect(pendenciesFor(o, DEFAULT_DEADLINES, NOW)).toContain("courier_waiting");
  });

  it("pedido novo e no prazo não gera pendência", () => {
    expect(pendenciesFor(order(), DEFAULT_DEADLINES, NOW)).toEqual([]);
    expect(orderUrgency(order(), DEFAULT_DEADLINES, NOW)).toBe("ok");
  });

  it("classifica urgência crítica no atraso", () => {
    const o = order({ status: "accepted", placed_at: minsAgo(90), accepted_at: minsAgo(80) });
    expect(orderUrgency(o, DEFAULT_DEADLINES, NOW)).toBe("critical");
  });
});

describe("ação principal", () => {
  it("segue a máquina de estados da Fase 4", () => {
    expect(primaryActionFor(order())?.action).toBe("accept");
    expect(primaryActionFor(order({ status: "accepted" }))?.action).toBe("start");
    expect(primaryActionFor(order({ status: "preparation_started" }))?.action).toBe("ready");
    expect(primaryActionFor(order({ status: "ready", order_type: "delivery" }))?.action).toBe("dispatch");
    expect(primaryActionFor(order({ status: "ready", order_type: "pickup" }))?.action).toBe("await_pickup");
    expect(primaryActionFor(order({ status: "dispatched" }))?.action).toBe("deliver");
    expect(primaryActionFor(order({ status: "delivered" }))?.action).toBe("complete");
    expect(primaryActionFor(order({ status: "completed" }))).toBeNull();
    expect(primaryActionFor(order({ status: "cancelled" }))).toBeNull();
  });
});

describe("dados pessoais", () => {
  it("abrevia o nome do cliente", () => {
    expect(shortCustomerName("Maria Aparecida Souza")).toBe("Maria A.");
    expect(shortCustomerName("João")).toBe("João");
    expect(shortCustomerName("")).toBe("Cliente não identificado");
  });

  it("mascara telefone sem permissão de dados do cliente", () => {
    expect(maskPhone("62 99236-5959", false)).toBe("•••• 5959");
    expect(maskPhone("62 99236-5959", true)).toBe("62 99236-5959");
    expect(maskPhone(null, true)).toBe("—");
  });

  it("mascara endereço para quem não pode ver dados do cliente", () => {
    const addr = { street: "Rua A", number: "100", district: "Centro", city: "Goiânia" };
    expect(maskAddress(addr, false)).toBe("Centro — Goiânia");
    expect(maskAddress(addr, true)).toContain("Rua A, 100");
    expect(maskAddress({}, true)).toBe("Sem endereço");
  });
});
