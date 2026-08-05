// Adaptador de simulação: único provedor habilitado nesta fase.
// Serve para validar inbox, outbox, retry e dead letter sem nenhuma
// integração real (que exige documentação, credenciais e homologação).
import {
  PermanentIntegrationError,
  TransientIntegrationError,
  type CanonicalEvent,
  type CanonicalEventType,
  type IntegrationContext,
  type OrdersAdapter,
  type OutboundMessage,
  type OutboundResult,
} from "../types.ts";
import { verifyHmacSignature } from "../core.ts";

const EVENT_TYPES: CanonicalEventType[] = [
  "order.created",
  "order.updated",
  "order.cancelled",
  "payment.updated",
  "delivery.updated",
  "customer.updated",
  "keepalive",
];

function asRecord(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new PermanentIntegrationError("invalid_payload", "Payload do evento não é um objeto.");
  }
  return raw as Record<string, unknown>;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new PermanentIntegrationError("invalid_payload", `Campo obrigatório ausente: ${field}.`);
  }
  return value.trim();
}

function toCents(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
    throw new PermanentIntegrationError(
      "invalid_payload",
      `Valor monetário inválido em ${field} (esperado inteiro em centavos).`,
    );
  }
  return value;
}

export const sandboxAdapter: OrdersAdapter = {
  provider: "sandbox",

  externalEventId(raw, headers) {
    const body = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    const fromBody = typeof body.event_id === "string" ? body.event_id.trim() : "";
    if (fromBody) return fromBody;
    const fromHeader = headers["x-event-id"]?.trim();
    return fromHeader ? fromHeader : null;
  },

  async verifySignature({ rawBody, headers, secret }) {
    return await verifyHmacSignature({
      rawBody,
      secret,
      provided: headers["x-signature"] ?? headers["x-hub-signature-256"] ?? null,
    });
  },

  toCanonical(raw) {
    const body = asRecord(raw);
    const type = requireString(body.event_type, "event_type") as CanonicalEventType;
    if (!EVENT_TYPES.includes(type)) {
      throw new PermanentIntegrationError("unsupported_event", `Evento não suportado: ${type}.`);
    }
    const event: CanonicalEvent = {
      type,
      externalEventId: requireString(body.event_id, "event_id"),
      externalOrderId: typeof body.order_id === "string" ? body.order_id : null,
      occurredAt: typeof body.occurred_at === "string" ? body.occurred_at : null,
      externalUnitId: typeof body.unit_id === "string" ? body.unit_id : null,
      isTest: true,
      sequence: typeof body.sequence === "number" ? body.sequence : null,
      status: typeof body.status === "string" ? body.status : null,
      notes: typeof body.notes === "string" ? body.notes : null,
      cancellationReason: typeof body.cancellation_reason === "string" ? body.cancellation_reason : null,
    };

    if (type === "order.created" || type === "order.updated") {
      const rawItems = Array.isArray(body.items) ? body.items : [];
      if (rawItems.length === 0) {
        throw new PermanentIntegrationError("invalid_payload", "Pedido sem itens.");
      }
      event.items = rawItems.map((item, index) => {
        const row = asRecord(item);
        const quantity = row.quantity;
        if (typeof quantity !== "number" || !Number.isInteger(quantity) || quantity <= 0) {
          throw new PermanentIntegrationError(
            "invalid_payload",
            `Quantidade inválida no item ${index + 1}.`,
          );
        }
        return {
          externalId: typeof row.id === "string" ? row.id : null,
          sku: typeof row.sku === "string" ? row.sku : null,
          name: requireString(row.name, `items[${index}].name`),
          quantity,
          unitPriceCents: toCents(row.unit_price_cents, `items[${index}].unit_price_cents`),
          notes: typeof row.notes === "string" ? row.notes : null,
        };
      });
      event.customer = {
        externalId: typeof body.customer_id === "string" ? body.customer_id : null,
        name: typeof body.customer_name === "string" ? body.customer_name : null,
        phone: typeof body.customer_phone === "string" ? body.customer_phone : null,
      };
      const mode = typeof body.mode === "string" ? body.mode : "pickup";
      if (!["delivery", "pickup", "dine_in"].includes(mode)) {
        throw new PermanentIntegrationError("invalid_payload", `Modalidade inválida: ${mode}.`);
      }
      event.delivery = { mode: mode as "delivery" | "pickup" | "dine_in" };
    }

    return event;
  },

  async send(message: OutboundMessage, ctx: IntegrationContext): Promise<OutboundResult> {
    // O simulador não faz chamadas externas. `simulate` permite exercitar
    // falhas transitórias/definitivas nos testes de fila.
    const simulate = (ctx.config?.simulate as string | undefined) ??
      (message.payload?.simulate as string | undefined);
    if (simulate === "transient") {
      throw new TransientIntegrationError("upstream_unavailable", "Canal indisponível (simulado).");
    }
    if (simulate === "permanent") {
      throw new PermanentIntegrationError("invalid_event", "Ação rejeitada pelo canal (simulado).");
    }
    return {
      externalRef: `sandbox-${message.operation}-${Date.now()}`,
      result: { simulated: true, operation: message.operation },
    };
  },
};
