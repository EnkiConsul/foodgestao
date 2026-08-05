// Regras puras do cardápio do módulo Pedidos (Fase 3).
// Preços SEMPRE em centavos (inteiro) — nunca ponto flutuante em cálculo.
// O backend é a fonte da verdade (RLS + RPCs ped_*).

import type { OrderChannel } from "@/lib/orders/units";

export const CATALOG_STATES = ["draft", "active", "paused", "unavailable", "archived"] as const;
export type CatalogState = (typeof CATALOG_STATES)[number];

export const CATALOG_STATE_LABELS: Record<CatalogState, string> = {
  draft: "Rascunho",
  active: "Disponível",
  paused: "Pausado",
  unavailable: "Indisponível",
  archived: "Arquivado",
};

export const CATALOG_STATE_VARIANTS: Record<CatalogState, "default" | "secondary" | "outline" | "destructive"> = {
  draft: "outline",
  active: "default",
  paused: "secondary",
  unavailable: "destructive",
  archived: "outline",
};

export const WEEKDAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"] as const;

export const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"] as const;
export const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "avif"] as const;

// ---------------------------------------------------------------- preços

/** "12,50" | "12.50" | "1.234,56" → 1250 (centavos). Retorna null se inválido. */
export function parsePriceToCents(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  if (typeof input === "number") {
    if (!Number.isFinite(input)) return null;
    return Math.round(input * 100);
  }
  const raw = input.trim();
  if (!raw) return null;
  let normalized = raw.replace(/[R$\s]/g, "");
  if (normalized.includes(",")) {
    normalized = normalized.replace(/\./g, "").replace(",", ".");
  }
  if (!/^-?\d+(\.\d{0,2})?$/.test(normalized)) return null;
  const [intPart, decPart = ""] = normalized.replace("-", "").split(".");
  const cents = Number(intPart) * 100 + Number(decPart.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents)) return null;
  return normalized.startsWith("-") ? -cents : cents;
}

/** 1250 → "R$ 12,50" */
export function formatCents(cents: number | null | undefined): string {
  const value = typeof cents === "number" && Number.isFinite(cents) ? cents : 0;
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(Math.trunc(value));
  const reais = Math.trunc(abs / 100);
  const rest = abs % 100;
  return `${sign}R$ ${reais.toLocaleString("pt-BR")},${String(rest).padStart(2, "0")}`;
}

/** 1250 → "12,50" (para inputs) */
export function centsToInput(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "";
  const abs = Math.abs(Math.trunc(cents));
  return `${cents < 0 ? "-" : ""}${Math.trunc(abs / 100)},${String(abs % 100).padStart(2, "0")}`;
}

export interface PriceParts {
  basePriceCents: number;
  variantPriceCents?: number | null;
  unitOverrideCents?: number | null;
  optionsCents?: number[];
}

/** Preço efetivo (centavos): override de unidade > variação > preço base, mais complementos. */
export function effectivePriceCents(parts: PriceParts): number {
  const base =
    typeof parts.unitOverrideCents === "number"
      ? parts.unitOverrideCents
      : typeof parts.variantPriceCents === "number"
        ? parts.variantPriceCents
        : parts.basePriceCents;
  const options = (parts.optionsCents ?? []).reduce((acc, c) => acc + Math.trunc(c), 0);
  return Math.trunc(base) + options;
}

// ------------------------------------------------------- disponibilidade

export interface AvailabilityWindow {
  unit_id: string | null;
  channels: OrderChannel[];
  weekday: number | null;
  starts_at: string | null; // "HH:MM"
  ends_at: string | null;
}

export interface AvailabilityContext {
  unitId: string | null;
  channel: OrderChannel | null;
  /** Momento local já resolvido no fuso da unidade. */
  now: Date;
}

export interface AvailabilityInput {
  state: CatalogState;
  pausedUntil?: string | null;
  trackStock?: boolean;
  stockQuantity?: number | null;
  unitState?: CatalogState | null;
  unitPausedUntil?: string | null;
  windows?: AvailabilityWindow[];
}

export type UnavailableReason =
  | "archived"
  | "draft"
  | "paused"
  | "unavailable"
  | "out_of_stock"
  | "out_of_window";

export interface AvailabilityResult {
  available: boolean;
  reason: UnavailableReason | null;
}

function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.slice(0, 5).split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function windowMatches(w: AvailabilityWindow, ctx: AvailabilityContext): boolean {
  if (w.unit_id && ctx.unitId && w.unit_id !== ctx.unitId) return false;
  if (w.channels.length > 0 && ctx.channel && !w.channels.includes(ctx.channel)) return false;
  if (w.weekday !== null && w.weekday !== ctx.now.getDay()) return false;
  if (w.starts_at && w.ends_at) {
    const nowMin = ctx.now.getHours() * 60 + ctx.now.getMinutes();
    if (nowMin < minutesOf(w.starts_at) || nowMin >= minutesOf(w.ends_at)) return false;
  }
  return true;
}

/** Espelho da regra de disponibilidade (a venda é sempre revalidada no backend). */
export function resolveAvailability(input: AvailabilityInput, ctx: AvailabilityContext): AvailabilityResult {
  const state = input.unitState ?? input.state;
  if (state === "archived") return { available: false, reason: "archived" };
  if (state === "draft") return { available: false, reason: "draft" };
  if (state === "unavailable") return { available: false, reason: "unavailable" };
  if (state === "paused") return { available: false, reason: "paused" };

  const pausedUntil = input.unitPausedUntil ?? input.pausedUntil;
  if (pausedUntil && new Date(pausedUntil).getTime() > ctx.now.getTime()) {
    return { available: false, reason: "paused" };
  }

  if (input.trackStock && (input.stockQuantity ?? 0) <= 0) {
    return { available: false, reason: "out_of_stock" };
  }

  const windows = input.windows ?? [];
  const relevant = windows.filter((w) => !w.unit_id || !ctx.unitId || w.unit_id === ctx.unitId);
  if (relevant.length > 0 && !relevant.some((w) => windowMatches(w, ctx))) {
    return { available: false, reason: "out_of_window" };
  }

  return { available: true, reason: null };
}

export const UNAVAILABLE_LABELS: Record<UnavailableReason, string> = {
  archived: "Arquivado",
  draft: "Não publicado",
  paused: "Pausado",
  unavailable: "Indisponível",
  out_of_stock: "Sem estoque",
  out_of_window: "Fora do horário",
};

// --------------------------------------------------- grupos e validações

export interface OptionGroupRule {
  id: string;
  name: string;
  is_required: boolean;
  min_choices: number;
  max_choices: number;
}

export interface OptionSelection {
  groupId: string;
  quantity: number;
}

/** Valida seleção de complementos contra mínimo/máximo dos grupos. */
export function validateOptionSelection(
  groups: OptionGroupRule[],
  selections: OptionSelection[],
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  for (const g of groups) {
    const total = selections
      .filter((s) => s.groupId === g.id)
      .reduce((acc, s) => acc + Math.max(0, Math.trunc(s.quantity)), 0);
    if (g.is_required && total < Math.max(1, g.min_choices)) {
      errors.push(`"${g.name}" é obrigatório (mínimo ${Math.max(1, g.min_choices)}).`);
    } else if (!g.is_required && total > 0 && total < g.min_choices) {
      errors.push(`"${g.name}" exige no mínimo ${g.min_choices} escolha(s).`);
    }
    if (total > g.max_choices) {
      errors.push(`"${g.name}" permite no máximo ${g.max_choices} escolha(s).`);
    }
  }
  return { valid: errors.length === 0, errors };
}

export function validateGroupRule(rule: Pick<OptionGroupRule, "is_required" | "min_choices" | "max_choices">): string | null {
  if (rule.max_choices < 1) return "O máximo de escolhas deve ser pelo menos 1.";
  if (rule.min_choices < 0) return "O mínimo de escolhas não pode ser negativo.";
  if (rule.min_choices > rule.max_choices) return "O mínimo não pode ser maior que o máximo.";
  if (rule.is_required && rule.min_choices < 1) return "Grupo obrigatório exige mínimo de 1 escolha.";
  return null;
}

// ------------------------------------------------------------- imagens

export function validateProductImage(file: { name: string; size: number; type: string }): string | null {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!(IMAGE_EXTENSIONS as readonly string[]).includes(ext)) {
    return "Formato inválido. Use JPG, PNG, WEBP ou AVIF.";
  }
  if (!(IMAGE_MIME_TYPES as readonly string[]).includes(file.type)) {
    return "Tipo de arquivo não permitido.";
  }
  if (file.size > IMAGE_MAX_BYTES) {
    return "Imagem maior que 5 MB.";
  }
  if (file.size <= 0) return "Arquivo vazio.";
  return null;
}

/** Path canônico no bucket: {company_id}/{product_id}/{timestamp}.{ext} */
export function buildProductImagePath(companyId: string, productId: string, fileName: string): string {
  const ext = (fileName.split(".").pop() ?? "jpg").toLowerCase();
  return `${companyId}/${productId}/${Date.now()}.${ext}`;
}

/** Reordena um array movendo `fromIndex` para `toIndex` (imutável). */
export function moveItem<T>(items: T[], fromIndex: number, toIndex: number): T[] {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return items;
  if (fromIndex >= items.length || toIndex >= items.length) return items;
  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}
