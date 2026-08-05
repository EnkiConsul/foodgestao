// Contrato canônico de integrações do módulo Pedidos.
// Nenhum provedor real é ativado aqui: cada canal externo implementa este
// contrato em seu próprio adaptador, sem espalhar `if (provider === ...)`.

export type IntegrationProvider =
  | "sandbox"
  | "ifood"
  | "rappi"
  | "anota_ai"
  | "goomer"
  | "custom";

export type CanonicalEventType =
  | "order.created"
  | "order.updated"
  | "order.cancelled"
  | "payment.updated"
  | "delivery.updated"
  | "customer.updated"
  | "keepalive";

export interface CanonicalCustomer {
  externalId?: string | null;
  name?: string | null;
  phone?: string | null;
  document?: string | null;
}

export interface CanonicalItem {
  externalId?: string | null;
  sku?: string | null;
  name: string;
  quantity: number;
  unitPriceCents: number;
  notes?: string | null;
  options?: { externalId?: string | null; name: string; priceCents: number; quantity: number }[];
}

export interface CanonicalDelivery {
  mode: "delivery" | "pickup" | "dine_in";
  addressLine?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  zipcode?: string | null;
  feeCents?: number | null;
  courierName?: string | null;
  status?: string | null;
}

export interface CanonicalPayment {
  method: string;
  amountCents: number;
  paid: boolean;
  externalId?: string | null;
  changeForCents?: number | null;
}

/** Evento normalizado que o worker do inbox sabe aplicar. */
export interface CanonicalEvent {
  type: CanonicalEventType;
  externalEventId: string;
  externalOrderId?: string | null;
  occurredAt?: string | null;
  externalUnitId?: string | null;
  isTest?: boolean;
  customer?: CanonicalCustomer;
  items?: CanonicalItem[];
  delivery?: CanonicalDelivery;
  payments?: CanonicalPayment[];
  totals?: {
    subtotalCents?: number | null;
    discountCents?: number | null;
    deliveryFeeCents?: number | null;
    serviceFeeCents?: number | null;
    totalCents?: number | null;
  };
  status?: string | null;
  cancellationReason?: string | null;
  notes?: string | null;
  /** Sequência do provedor para descartar evento fora de ordem. */
  sequence?: number | null;
}

/** Ação canônica enviada para o canal externo (fila de saída). */
export type OutboundOperation =
  | "order.accept"
  | "order.reject"
  | "order.ready"
  | "order.dispatch"
  | "order.complete"
  | "order.cancel"
  | "menu.sync"
  | "unit.availability";

export interface OutboundMessage {
  operation: OutboundOperation | string;
  orderId?: string | null;
  externalOrderId?: string | null;
  payload: Record<string, unknown>;
}

export interface OutboundResult {
  externalRef?: string | null;
  result?: Record<string, unknown>;
}

export interface IntegrationContext {
  integrationId: string;
  companyId: string;
  unitId: string | null;
  provider: IntegrationProvider;
  config: Record<string, unknown>;
  /** Segredo do canal, lido apenas no backend. */
  secret: string | null;
}

/** Contrato comum a todos os provedores. */
export interface OrdersAdapter {
  provider: IntegrationProvider;
  /** Extrai o identificador único do evento (idempotência). */
  externalEventId(raw: unknown, headers: Record<string, string>): string | null;
  /** Valida a assinatura do webhook. Fail closed. */
  verifySignature(input: {
    rawBody: string;
    headers: Record<string, string>;
    secret: string | null;
  }): Promise<boolean>;
  /** Converte o payload cru no evento canônico. Lança em payload inválido. */
  toCanonical(raw: unknown, headers: Record<string, string>): CanonicalEvent;
  /** Envia a ação para o canal externo. */
  send(message: OutboundMessage, ctx: IntegrationContext): Promise<OutboundResult>;
}

export class PermanentIntegrationError extends Error {
  readonly errorClass: string;
  constructor(errorClass: string, message: string) {
    super(message);
    this.name = "PermanentIntegrationError";
    this.errorClass = errorClass;
  }
}

export class TransientIntegrationError extends Error {
  readonly errorClass: string;
  constructor(errorClass: string, message: string) {
    super(message);
    this.name = "TransientIntegrationError";
    this.errorClass = errorClass;
  }
}
