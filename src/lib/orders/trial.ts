// Regras puras de encerramento do teste gratuito, modo consulta e contratação.
// O backend (`can_use_orders_module` / `orders_trial_snapshot`) é a fonte da verdade;
// aqui ficam apenas cálculos de apresentação e o aviso ao usuário.
import type { ModuleStatus } from "@/lib/modules";

export type TrialWarningLevel = "none" | "info" | "warning" | "critical" | "expired";

export interface TrialCountdown {
  msLeft: number;
  daysLeft: number;
  hoursLeft: number;
  minutesLeft: number;
  isLastDay: boolean;
  expired: boolean;
  level: TrialWarningLevel;
}

/** Contagem regressiva detalhada até o fim do teste. Fail closed: sem data => expirado. */
export function ordersTrialCountdown(
  trialEndsAt: string | null | undefined,
  now: Date = new Date(),
): TrialCountdown {
  if (!trialEndsAt) {
    return {
      msLeft: 0,
      daysLeft: 0,
      hoursLeft: 0,
      minutesLeft: 0,
      isLastDay: false,
      expired: true,
      level: "expired",
    };
  }
  const msLeft = new Date(trialEndsAt).getTime() - now.getTime();
  if (!Number.isFinite(msLeft) || msLeft <= 0) {
    return {
      msLeft: 0,
      daysLeft: 0,
      hoursLeft: 0,
      minutesLeft: 0,
      isLastDay: false,
      expired: true,
      level: "expired",
    };
  }
  const totalMinutes = Math.floor(msLeft / 60_000);
  const daysLeft = Math.ceil(msLeft / 86_400_000);
  const hoursLeft = Math.floor(msLeft / 3_600_000);
  const isLastDay = msLeft <= 86_400_000;
  const level: TrialWarningLevel = isLastDay
    ? "critical"
    : daysLeft <= 2
      ? "warning"
      : "info";
  return {
    msLeft,
    daysLeft,
    hoursLeft,
    minutesLeft: totalMinutes % 60,
    isLastDay,
    expired: false,
    level,
  };
}

/** Texto curto do tempo restante ("2 dias", "7 h 20 min", "40 min"). */
export function formatTrialTimeLeft(countdown: TrialCountdown): string {
  if (countdown.expired) return "encerrado";
  if (!countdown.isLastDay) {
    return `${countdown.daysLeft} ${countdown.daysLeft === 1 ? "dia" : "dias"}`;
  }
  if (countdown.hoursLeft >= 1) {
    return `${countdown.hoursLeft} h${countdown.minutesLeft ? ` ${countdown.minutesLeft} min` : ""}`;
  }
  return `${Math.max(1, countdown.minutesLeft)} min`;
}

/** Data e hora exatas do encerramento, no formato brasileiro. */
export function formatTrialDeadline(trialEndsAt: string | null | undefined): string | null {
  if (!trialEndsAt) return null;
  const date = new Date(trialEndsAt);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Modo consulta: dados visíveis, novas operações bloqueadas. */
export function isConsultaMode(status: ModuleStatus): boolean {
  return status === "trial_expirado" || status === "suspended" || status === "canceled";
}

/** Janela de retenção dos dados após a expiração. */
export function retentionWindow(
  expiredAt: string | null | undefined,
  retentionDays: number | null | undefined,
  now: Date = new Date(),
): { until: Date; daysRemaining: number } | null {
  if (!expiredAt) return null;
  const base = new Date(expiredAt);
  if (Number.isNaN(base.getTime())) return null;
  const days = retentionDays && retentionDays > 0 ? retentionDays : 180;
  const until = new Date(base.getTime() + days * 86_400_000);
  return {
    until,
    daysRemaining: Math.max(0, Math.ceil((until.getTime() - now.getTime()) / 86_400_000)),
  };
}

export interface OrdersUsageSummary {
  units: number;
  open_units: number;
  menus: number;
  products: number;
  orders: number;
  test_orders: number;
  in_flight_orders: number;
  payments: number;
  customers: number;
}

/** O que já foi usado no teste (para a tela de contratação). */
export function summarizeTrialUsage(usage: Partial<OrdersUsageSummary> | null | undefined) {
  const u = usage ?? {};
  return [
    { label: "Unidades cadastradas", value: u.units ?? 0 },
    { label: "Cardápios", value: u.menus ?? 0 },
    { label: "Produtos", value: u.products ?? 0 },
    { label: "Pedidos reais", value: u.orders ?? 0 },
    { label: "Pedidos de teste", value: u.test_orders ?? 0 },
    { label: "Pagamentos registrados", value: u.payments ?? 0 },
  ];
}

const EXPORT_COLUMNS: { key: string; label: string }[] = [
  { key: "display_number", label: "Pedido" },
  { key: "placed_at", label: "Data" },
  { key: "status", label: "Status" },
  { key: "order_type", label: "Tipo" },
  { key: "order_timing", label: "Momento" },
  { key: "payment_status", label: "Pagamento" },
  { key: "customer_name", label: "Cliente" },
  { key: "subtotal", label: "Subtotal" },
  { key: "discount_amount", label: "Desconto" },
  { key: "delivery_fee", label: "Taxa entrega" },
  { key: "service_fee", label: "Taxa serviço" },
  { key: "total_amount", label: "Total" },
  { key: "is_test", label: "Teste" },
  { key: "completed_at", label: "Concluído em" },
  { key: "cancelled_at", label: "Cancelado em" },
  { key: "cancellation_reason", label: "Motivo cancelamento" },
];

/** CSV (UTF-8 + BOM, ponto e vírgula) dos pedidos exportados. */
export function buildOrdersExportCsv(rows: Record<string, unknown>[]): string {
  const header = EXPORT_COLUMNS.map((c) => c.label).join(";");
  const lines = rows.map((row) =>
    EXPORT_COLUMNS.map((c) => {
      const raw = row[c.key];
      if (raw === null || raw === undefined) return "";
      if (typeof raw === "boolean") return raw ? "Sim" : "Não";
      const text = String(raw).replace(/[\r\n]+/g, " ").replace(/"/g, '""');
      return text.includes(";") || text.includes('"') ? `"${text}"` : text;
    }).join(";"),
  );
  return `\uFEFF${[header, ...lines].join("\n")}`;
}
