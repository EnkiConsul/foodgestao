/**
 * Loja online (cardápio público) — tipos, temas e regras compartilhadas
 * entre a configuração no onboarding e a página pública `/c/:slug`.
 */
import { PUBLIC_SITE_ORIGIN } from "@/lib/siteOrigin";


// ---------------- Configuração ----------------

export interface StorefrontConfig {
  id: string;
  company_id: string;
  unit_id: string;
  slug: string;
  theme: StorefrontTheme;
  primary_color: string;
  logo_url: string | null;
  banner_url: string | null;
  banner_fit: BannerFit;
  banner_zoom: number;
  banner_focus_x: number;
  banner_focus_y: number;

  headline: string | null;
  about: string | null;
  whatsapp_phone: string | null;
  online_cart_enabled: boolean;
  is_published: boolean;
  published_at: string | null;
}

export const STOREFRONT_THEMES = ["classic", "dark", "fresh", "bold"] as const;
export type StorefrontTheme = (typeof STOREFRONT_THEMES)[number];

export interface ThemeTokens {
  label: string;
  desc: string;
  /** Cor de fundo da página. */
  bg: string;
  /** Cor de superfície (cards). */
  surface: string;
  /** Texto principal. */
  text: string;
  /** Texto secundário. */
  muted: string;
  /** Borda dos cards. */
  border: string;
  /** Cor do texto sobre a cor primária. */
  onPrimary: string;
  /** Superfície levemente tingida (selos, blocos internos). */
  accent: string;
  /** Cor de ação secundária (WhatsApp). */
  sage: string;
  /** Texto sobre a cor de ação secundária. */
  onSage: string;
  /** Bloco escuro de destaque (horários). */
  ink: string;
  /** Texto sobre o bloco escuro. */
  onInk: string;
  /** Texto secundário sobre o bloco escuro. */
  inkMuted: string;
}

export const THEME_TOKENS: Record<StorefrontTheme, ThemeTokens> = {
  classic: {
    label: "Clássico",
    desc: "Fundo quente e cartões brancos. Combina com qualquer marca.",
    bg: "#FAF7F2",
    surface: "#FFFFFF",
    text: "#292524",
    muted: "#78716C",
    border: "#EDE7DF",
    onPrimary: "#FFFFFF",
    accent: "#F7F2EB",
    sage: "#87A878",
    onSage: "#FFFFFF",
    ink: "#292524",
    onInk: "#FAFAF9",
    inkMuted: "#D6D3D1",
  },
  dark: {
    label: "Escuro",
    desc: "Fundo marinho com destaque na cor da marca.",
    bg: "#0F1B3D",
    surface: "#16244C",
    text: "#F8FAFC",
    muted: "#A9B4CC",
    border: "#25355F",
    onPrimary: "#FFFFFF",
    accent: "#1B2C5C",
    sage: "#87A878",
    onSage: "#0F1B3D",
    ink: "#0A1330",
    onInk: "#F8FAFC",
    inkMuted: "#A9B4CC",
  },
  fresh: {
    label: "Leve",
    desc: "Tons quentes e suaves, indicado para cafés e padarias.",
    bg: "#FBF7F1",
    surface: "#FFFFFF",
    text: "#211A14",
    muted: "#7A6A5A",
    border: "#EADFD1",
    onPrimary: "#FFFFFF",
    accent: "#F6EFE5",
    sage: "#87A878",
    onSage: "#FFFFFF",
    ink: "#3A2E24",
    onInk: "#FBF7F1",
    inkMuted: "#D8C9B6",
  },
  bold: {
    label: "Contrastado",
    desc: "Preto com tipografia forte, para marcas mais ousadas.",
    bg: "#101010",
    surface: "#1B1B1B",
    text: "#FAFAFA",
    muted: "#A3A3A3",
    border: "#2E2E2E",
    onPrimary: "#101010",
    accent: "#232323",
    sage: "#87A878",
    onSage: "#101010",
    ink: "#000000",
    onInk: "#FAFAFA",
    inkMuted: "#A3A3A3",
  },
};

export function themeStyle(theme: StorefrontTheme, primary: string): Record<string, string> {
  const t = THEME_TOKENS[theme] ?? THEME_TOKENS.classic;
  return {
    // Variáveis consumidas pelos componentes da loja pública.
    ["--sf-bg" as string]: t.bg,
    ["--sf-surface" as string]: t.surface,
    ["--sf-text" as string]: t.text,
    ["--sf-muted" as string]: t.muted,
    ["--sf-border" as string]: t.border,
    ["--sf-primary" as string]: isValidHexColor(primary) ? primary : "#C4654A",
    ["--sf-on-primary" as string]: t.onPrimary,
    ["--sf-accent" as string]: t.accent,
    ["--sf-sage" as string]: t.sage,
    ["--sf-on-sage" as string]: t.onSage,
    ["--sf-ink" as string]: t.ink,
    ["--sf-on-ink" as string]: t.onInk,
    ["--sf-ink-muted" as string]: t.inkMuted,
    ["--sf-font-head" as string]: "'Outfit', ui-sans-serif, system-ui, sans-serif",
    ["--sf-font-body" as string]: "'Figtree', ui-sans-serif, system-ui, sans-serif",
  };
}


// ---------------- Slug ----------------

export const SLUG_MIN = 3;
export const SLUG_MAX = 40;

const RESERVED_SLUGS = new Set([
  "admin",
  "api",
  "app",
  "auth",
  "c",
  "cardapio",
  "checkout",
  "dp",
  "login",
  "pedidos",
  "public",
  "storefront",
  "www",
]);

/** Converte um nome livre em slug de URL. */
export function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX)
    .replace(/-+$/g, "");
}

export function isValidSlug(slug: string): boolean {
  const s = slug.trim().toLowerCase();
  if (s.length < SLUG_MIN || s.length > SLUG_MAX) return false;
  if (RESERVED_SLUGS.has(s)) return false;
  return /^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(s) && !s.includes("--");
}

export function isValidHexColor(value: string | null | undefined): boolean {
  return /^#[0-9a-fA-F]{6}$/.test((value ?? "").trim());
}


/** Valida a configuração antes de salvar/publicar. */
export function validateStorefront(input: {
  slug: string;
  primary_color: string;
  theme: string;
  headline?: string | null;
  about?: string | null;
  whatsapp_phone?: string | null;
}): string[] {
  const errors: string[] = [];
  if (!isValidSlug(input.slug)) {
    errors.push(
      `O link deve ter de ${SLUG_MIN} a ${SLUG_MAX} caracteres, usar apenas letras, números e hífens, e não pode ser um nome reservado.`,
    );
  }
  if (!isValidHexColor(input.primary_color)) errors.push("Escolha uma cor principal válida.");
  if (!(STOREFRONT_THEMES as readonly string[]).includes(input.theme)) {
    errors.push("Selecione um tema disponível.");
  }
  if ((input.headline ?? "").length > 120) errors.push("A frase de destaque deve ter até 120 caracteres.");
  if ((input.about ?? "").length > 600) errors.push("A descrição deve ter até 600 caracteres.");
  const phone = onlyDigits(input.whatsapp_phone ?? "");
  if (phone && (phone.length < 10 || phone.length > 13)) {
    errors.push("Informe um WhatsApp válido com DDD.");
  }
  return errors;
}

export function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

/**
 * URL pública da loja, usada no QR code e no compartilhamento.
 * Sempre no domínio oficial — nunca no host do preview.
 */
export function storefrontPublicUrl(slug: string): string {
  return `${PUBLIC_SITE_ORIGIN}/c/${slug}`;
}

/** URL de imagem servida pela Edge Function (buckets são privados). */
export function storefrontMediaUrl(slug: string, bucket: "ped-storefront" | "ped-produtos", path?: string | null) {
  if (!path) return null;
  const base = import.meta.env.VITE_SUPABASE_URL;
  const qs = new URLSearchParams({ slug, bucket, path });
  return `${base}/functions/v1/storefront-media?${qs.toString()}`;
}

// ---------------- Cardápio público ----------------

export interface PublicOption {
  id: string;
  name: string;
  description: string | null;
  price_cents: number;
  max_quantity: number | null;
}

export interface PublicOptionGroup {
  id: string;
  name: string;
  is_required: boolean;
  min_choices: number;
  max_choices: number | null;
  options: PublicOption[];
}

export interface PublicVariant {
  id: string;
  name: string;
  price_cents: number;
  is_default: boolean;
}

export interface PublicProduct {
  id: string;
  name: string;
  description: string | null;
  image_path: string | null;
  sort_order: number;
  allows_notes: boolean;
  price_cents: number;
  available: boolean;
  variants: PublicVariant[];
  option_groups: PublicOptionGroup[];
}

export interface PublicCategory {
  id: string;
  name: string;
  description: string | null;
  sort_order: number;
  products: PublicProduct[];
}

export interface PublicZone {
  id: string;
  name: string;
  fee_amount: number;
  min_order_amount: number | null;
  eta_minutes: number | null;
  bairros: string[] | null;
}

export interface PublicPaymentOption {
  id: string;
  kind: string;
  label: string;
}

export interface PublicHour {
  weekday: number;
  opens_at: string;
  closes_at: string;
}

export interface PublicHourException {
  exception_date: string;
  is_closed: boolean;
  opens_at: string | null;
  closes_at: string | null;
  note: string | null;
}

export interface PublicStorefront {
  found: true;
  store: {
    slug: string;
    theme: StorefrontTheme;
    primary_color: string;
    logo_url: string | null;
    banner_url: string | null;
    headline: string | null;
    about: string | null;
    whatsapp_phone: string | null;
    online_cart_enabled: boolean;
  };
  unit: {
    id: string;
    name: string;
    timezone: string;
    state: string;
    prep_time_minutes: number;
    fulfillment_modes: string[];
    min_order_amount: number;
    service_fee_percent: number;
    scheduled_orders_enabled: boolean;
  };
  hours: PublicHour[];
  exceptions: PublicHourException[];
  zones: PublicZone[];
  payment_options: PublicPaymentOption[];
  categories: PublicCategory[];
}

export type PublicStorefrontResult = PublicStorefront | { found: false };

// ---------------- Horário ----------------

export const WEEKDAY_LABELS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

function nowInTimezone(timezone: string): { weekday: number; time: string; date: string } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone || "America/Sao_Paulo",
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(new Date()).map((p) => [p.type, p.value]));
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    weekday: weekdayMap[parts.weekday as string] ?? 0,
    time: `${parts.hour}:${parts.minute}`,
    date: `${parts.year}-${parts.month}-${parts.day}`,
  };
}

/** Espelha a regra de horário validada no servidor (apenas informativo na UI). */
export function isStorefrontOpen(data: PublicStorefront): boolean {
  if (data.unit.state !== "open") return false;
  const { weekday, time, date } = nowInTimezone(data.unit.timezone);
  const exception = data.exceptions.find((e) => e.exception_date === date);
  if (exception) {
    if (exception.is_closed || !exception.opens_at || !exception.closes_at) return false;
    return time >= exception.opens_at.slice(0, 5) && time <= exception.closes_at.slice(0, 5);
  }
  return data.hours.some(
    (h) => h.weekday === weekday && time >= h.opens_at.slice(0, 5) && time <= h.closes_at.slice(0, 5),
  );
}

/** Próximo horário de abertura, em texto amigável. */
export function nextOpeningLabel(data: PublicStorefront): string | null {
  if (data.hours.length === 0) return null;
  const { weekday, time } = nowInTimezone(data.unit.timezone);
  for (let offset = 0; offset < 7; offset++) {
    const day = (weekday + offset) % 7;
    const slots = data.hours
      .filter((h) => h.weekday === day)
      .map((h) => h.opens_at.slice(0, 5))
      .sort();
    const slot = offset === 0 ? slots.find((s) => s > time) : slots[0];
    if (slot) {
      if (offset === 0) return `Abre hoje às ${slot}`;
      if (offset === 1) return `Abre amanhã às ${slot}`;
      return `Abre ${WEEKDAY_LABELS[day]} às ${slot}`;
    }
  }
  return null;
}

/** Agrupa horários por dia da semana para exibição. */
export function groupHoursByWeekday(hours: PublicHour[]): { weekday: number; label: string; periods: string[] }[] {
  return WEEKDAY_LABELS.map((label, weekday) => ({
    weekday,
    label,
    periods: hours
      .filter((h) => h.weekday === weekday)
      .sort((a, b) => a.opens_at.localeCompare(b.opens_at))
      .map((h) => `${h.opens_at.slice(0, 5)} às ${h.closes_at.slice(0, 5)}`),
  }));
}

// ---------------- Carrinho ----------------

export interface CartOption {
  option_id: string;
  group_id: string;
  name: string;
  quantity: number;
  price_cents: number;
}

export interface CartItem {
  key: string;
  product_id: string;
  product_name: string;
  variant_id: string | null;
  variant_name: string | null;
  unit_price_cents: number;
  quantity: number;
  notes: string | null;
  options: CartOption[];
  image_path: string | null;
}

export function cartItemUnitTotal(item: CartItem): number {
  const options = item.options.reduce((sum, o) => sum + o.price_cents * o.quantity, 0);
  return item.unit_price_cents + options;
}

export function cartItemTotal(item: CartItem): number {
  return cartItemUnitTotal(item) * item.quantity;
}

export function cartSubtotal(items: CartItem[]): number {
  return items.reduce((sum, i) => sum + cartItemTotal(i), 0);
}

export function cartCount(items: CartItem[]): number {
  return items.reduce((sum, i) => sum + i.quantity, 0);
}

export interface CartTotals {
  subtotal: number;
  deliveryFee: number;
  serviceFee: number;
  total: number;
}

/** Espelha o cálculo do servidor: frete por zona + taxa de serviço percentual. */
export function computeCartTotals(
  items: CartItem[],
  opts: { zone?: PublicZone | null; serviceFeePercent: number; isDelivery: boolean },
): CartTotals {
  const subtotal = cartSubtotal(items);
  const deliveryFee = opts.isDelivery ? (opts.zone?.fee_amount ?? 0) : 0;
  const serviceFee = Math.round((subtotal * (opts.serviceFeePercent || 0)) / 100);
  return { subtotal, deliveryFee, serviceFee, total: subtotal + deliveryFee + serviceFee };
}

/** Erros de carrinho que impedem o envio (mesmas regras validadas no servidor). */
export function validateCart(input: {
  items: CartItem[];
  orderType: string;
  minOrderAmount: number;
  zone?: PublicZone | null;
  customerName: string;
  customerPhone: string;
  street?: string;
  number?: string;
  paymentOptionId?: string | null;
  requirePayment: boolean;
}): string[] {
  const errors: string[] = [];
  if (input.items.length === 0) errors.push("Seu carrinho está vazio.");
  if (input.customerName.trim().length < 2) errors.push("Informe seu nome.");
  const phone = onlyDigits(input.customerPhone);
  if (phone.length < 10 || phone.length > 13) errors.push("Informe um telefone válido com DDD.");
  const subtotal = cartSubtotal(input.items);
  if (input.minOrderAmount > 0 && subtotal < input.minOrderAmount) {
    errors.push(`O pedido mínimo é de ${formatCents(input.minOrderAmount)}.`);
  }
  if (input.orderType === "delivery") {
    if (!input.zone) errors.push("Selecione a região de entrega.");
    if (!input.street?.trim()) errors.push("Informe o endereço de entrega.");
    if (!input.number?.trim()) errors.push("Informe o número do endereço.");
    if (input.zone?.min_order_amount && subtotal < input.zone.min_order_amount) {
      errors.push(`Esta região exige pedido mínimo de ${formatCents(input.zone.min_order_amount)}.`);
    }
  }
  if (input.requirePayment && !input.paymentOptionId) errors.push("Selecione a forma de pagamento.");
  return errors;
}

/** Opções obrigatórias de um produto ainda não atendidas. */
export function validateProductSelection(
  product: PublicProduct,
  selection: { variantId: string | null; options: CartOption[] },
): string[] {
  const errors: string[] = [];
  if (product.variants.length > 0 && !selection.variantId) errors.push("Escolha uma opção de tamanho/variação.");
  for (const group of product.option_groups) {
    const chosen = selection.options
      .filter((o) => o.group_id === group.id)
      .reduce((sum, o) => sum + o.quantity, 0);
    const min = group.is_required ? Math.max(group.min_choices, 1) : group.min_choices;
    if (chosen < min) errors.push(`Escolha ao menos ${min} item(ns) em "${group.name}".`);
    if (group.max_choices && chosen > group.max_choices) {
      errors.push(`Em "${group.name}" escolha no máximo ${group.max_choices} item(ns).`);
    }
  }
  return errors;
}

export function formatCents(cents: number): string {
  return ((cents ?? 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Payload de itens aceito por `storefront_public_create_order`. */
export function cartToPayload(items: CartItem[]) {
  return items.map((i) => ({
    product_id: i.product_id,
    variant_id: i.variant_id,
    quantity: i.quantity,
    notes: i.notes,
    options: i.options.map((o) => ({ option_id: o.option_id, quantity: o.quantity })),
  }));
}

/** Mensagem de WhatsApp com o resumo do carrinho (fluxo sem carrinho online). */
export function cartToWhatsappText(items: CartItem[], unitName: string): string {
  const lines = items.map((i) => {
    const extras = i.options.length > 0 ? ` (${i.options.map((o) => o.name).join(", ")})` : "";
    const variant = i.variant_name ? ` - ${i.variant_name}` : "";
    const notes = i.notes ? ` | obs: ${i.notes}` : "";
    return `• ${i.quantity}x ${i.product_name}${variant}${extras}${notes} — ${formatCents(cartItemTotal(i))}`;
  });
  return [
    `Olá! Quero fazer um pedido no ${unitName}:`,
    "",
    ...lines,
    "",
    `Total: ${formatCents(cartSubtotal(items))}`,
  ].join("\n");
}

export function whatsappLink(phone: string, text: string): string {
  const digits = onlyDigits(phone);
  const full = digits.length <= 11 ? `55${digits}` : digits;
  return `https://wa.me/${full}?text=${encodeURIComponent(text)}`;
}

export const ORDER_TYPE_LABELS: Record<string, string> = {
  delivery: "Entrega",
  pickup: "Retirada no local",
  counter: "Balcão",
  dine_in: "Consumo no local",
  drive_thru: "Drive-thru",
};

export const PUBLIC_STATUS_LABELS: Record<string, string> = {
  draft: "Rascunho",
  pending_acceptance: "Aguardando confirmação",
  accepted: "Confirmado",
  in_production: "Em preparo",
  ready: "Pronto",
  dispatched: "Saiu para entrega",
  delivered: "Entregue",
  completed: "Concluído",
  cancelled: "Cancelado",
  rejected: "Recusado",
};
