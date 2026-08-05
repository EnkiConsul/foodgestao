// Camada de impressão desacoplada.
// A UI só produz o conteúdo da comanda; a saída é feita por um conector local
// (quando existir) ou pelo fallback de impressão do navegador.

import { STATION_LABELS, type KitchenItem, type PrintStation } from "./kitchen";

export const PRINT_JOB_STATUSES = ["queued", "printing", "printed", "failed", "cancelled"] as const;
export type PrintJobStatus = (typeof PRINT_JOB_STATUSES)[number];

export const PRINT_JOB_STATUS_LABELS: Record<PrintJobStatus, string> = {
  queued: "Na fila",
  printing: "Imprimindo",
  printed: "Impresso",
  failed: "Falhou",
  cancelled: "Cancelado",
};

export const MAX_PRINT_COPIES = 3;

export function normalizeCopies(copies: number | null | undefined, fallback = 1): number {
  const value = Math.trunc(Number(copies ?? fallback));
  if (!Number.isFinite(value)) return 1;
  return Math.min(MAX_PRINT_COPIES, Math.max(1, value));
}

/**
 * Chave de idempotência da comanda: mesma origem nunca gera vias extras.
 * Reimpressões recebem um sufixo explícito e auditado.
 */
export function printIdempotencyKey(input: {
  orderId: string;
  station: PrintStation;
  status: string;
  reprintSeq?: number;
}): string {
  const base = `${input.orderId}:${input.station}:${input.status}`;
  return input.reprintSeq && input.reprintSeq > 0 ? `${base}:re${input.reprintSeq}` : base;
}

// ------------------------------------------------------------------ conteúdo
export interface PrintTicketInput {
  station: PrintStation;
  unitName: string;
  displayNumber: number;
  orderTypeLabel: string;
  placedAt: string;
  items: KitchenItem[];
  notes?: string | null;
  pickupCode?: string | null;
  courierName?: string | null;
  /** Só é preenchido para estações administrativas (caixa/expedição). */
  totalLabel?: string | null;
  customerLabel?: string | null;
  addressLabel?: string | null;
  isReprint?: boolean;
  copyIndex?: number;
  copies?: number;
}

/** Estações de produção nunca recebem valores ou dados de cliente. */
export function stationAllowsFinancialData(station: PrintStation): boolean {
  return station === "caixa" || station === "expedicao";
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Texto puro da comanda (58mm) — base do conector local e do fallback. */
export function buildTicketText(input: PrintTicketInput): string {
  const lines: string[] = [];
  const sep = "-".repeat(32);
  lines.push(`** ${STATION_LABELS[input.station].toUpperCase()} **`);
  lines.push(input.unitName);
  lines.push(sep);
  lines.push(`PEDIDO #${input.displayNumber}`);
  lines.push(input.orderTypeLabel);
  lines.push(new Date(input.placedAt).toLocaleString("pt-BR"));
  if (input.isReprint) lines.push("*** REIMPRESSAO ***");
  if (input.copies && input.copies > 1) lines.push(`Via ${input.copyIndex ?? 1}/${input.copies}`);
  lines.push(sep);

  input.items.forEach((item) => {
    lines.push(`${item.quantity}x ${item.name}${item.variantName ? ` (${item.variantName})` : ""}`);
    (item.options ?? []).forEach((o) => lines.push(`   + ${o.quantity}x ${o.name}`));
    if (item.notes) lines.push(`   Obs: ${item.notes}`);
  });

  if (input.notes) {
    lines.push(sep);
    lines.push(`OBS: ${input.notes}`);
  }

  if (stationAllowsFinancialData(input.station)) {
    lines.push(sep);
    if (input.customerLabel) lines.push(`Cliente: ${input.customerLabel}`);
    if (input.addressLabel) lines.push(`Entrega: ${input.addressLabel}`);
    if (input.courierName) lines.push(`Entregador: ${input.courierName}`);
    if (input.totalLabel) lines.push(`TOTAL: ${input.totalLabel}`);
  }

  if (input.pickupCode) {
    lines.push(sep);
    lines.push(`RETIRADA: ${input.pickupCode}`);
  }

  return lines.join("\n");
}

/** HTML da comanda para o fallback de impressão do navegador. */
export function buildTicketHtml(inputs: PrintTicketInput[]): string {
  const body = inputs
    .map(
      (input) =>
        `<pre class="ticket">${escapeHtml(buildTicketText(input))}</pre>`,
    )
    .join("");
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8" />
<title>Comanda</title>
<style>
@page { size: 58mm auto; margin: 3mm; }
body { margin: 0; font-family: "Courier New", monospace; }
.ticket { font-size: 12px; line-height: 1.35; white-space: pre-wrap; page-break-after: always; margin: 0 0 8mm; }
.ticket:last-child { page-break-after: auto; }
</style></head><body>${body}</body></html>`;
}

// ------------------------------------------------------------------ saída
export interface PrintConnector {
  name: string;
  print: (payload: { text: string; copies: number; printer?: string | null }) => Promise<void>;
}

interface ConnectorWindow {
  food360Print?: PrintConnector;
}

/** Conector local opcional (app de impressão instalado na loja). */
export function detectConnector(scope: unknown = globalThis): PrintConnector | null {
  const candidate = (scope as ConnectorWindow | undefined)?.food360Print;
  if (candidate && typeof candidate.print === "function") return candidate;
  return null;
}

export type PrintOutcome =
  | { ok: true; via: "connector" | "browser" }
  | { ok: false; via: "connector" | "browser"; error: string };

/**
 * Imprime via conector local; se não houver (ou falhar), cai para o navegador.
 * Nunca assume acesso direto à impressora.
 */
export async function printTickets(
  inputs: PrintTicketInput[],
  options?: { printer?: string | null; connector?: PrintConnector | null; openWindow?: () => Window | null },
): Promise<PrintOutcome> {
  if (inputs.length === 0) return { ok: false, via: "browser", error: "Nada para imprimir." };

  const connector = options?.connector ?? detectConnector();
  if (connector) {
    try {
      await connector.print({
        text: inputs.map(buildTicketText).join("\n\n"),
        copies: inputs.length,
        printer: options?.printer ?? null,
      });
      return { ok: true, via: "connector" };
    } catch (error) {
      return {
        ok: false,
        via: "connector",
        error: error instanceof Error ? error.message : "Falha no conector de impressão.",
      };
    }
  }

  const open =
    options?.openWindow ??
    (() => (typeof window === "undefined" ? null : window.open("", "_blank", "width=380,height=640")));
  const win = open();
  if (!win) {
    return {
      ok: false,
      via: "browser",
      error: "O navegador bloqueou a janela de impressão. Libere pop-ups para imprimir.",
    };
  }
  win.document.write(buildTicketHtml(inputs));
  win.document.close();
  win.focus();
  win.print();
  return { ok: true, via: "browser" };
}
