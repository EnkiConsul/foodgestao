// Regras puras do onboarding de unidades do módulo Pedidos.
// O backend é a fonte da verdade (RPCs ped_* / activate_orders_unit);
// aqui ficam apenas rótulos, validações de formulário e espelho do checklist.

export const FULFILLMENT_MODES = ["delivery", "pickup", "counter", "table", "dine_in"] as const;
export type FulfillmentMode = (typeof FULFILLMENT_MODES)[number];

export const FULFILLMENT_LABELS: Record<FulfillmentMode, string> = {
  delivery: "Entrega (delivery)",
  pickup: "Retirada no local",
  counter: "Balcão",
  table: "Mesa",
  dine_in: "Consumo no local",
};

export const ORDER_CHANNELS = ["balcao", "link_proprio", "whatsapp", "telefone", "integracao"] as const;
export type OrderChannel = (typeof ORDER_CHANNELS)[number];

export const CHANNEL_LABELS: Record<OrderChannel, string> = {
  balcao: "Atendimento no balcão",
  link_proprio: "Link próprio de pedidos",
  whatsapp: "WhatsApp",
  telefone: "Telefone",
  integracao: "Integração externa (iFood etc.)",
};

export const PAYMENT_KINDS = ["pix", "dinheiro", "credito", "debito", "vale", "online", "outro"] as const;
export type PaymentKind = (typeof PAYMENT_KINDS)[number];

export const PAYMENT_LABELS: Record<PaymentKind, string> = {
  pix: "PIX",
  dinheiro: "Dinheiro",
  credito: "Cartão de crédito",
  debito: "Cartão de débito",
  vale: "Vale / benefício",
  online: "Pagamento online",
  outro: "Outro",
};

export const UNIT_STATES = ["setup", "closed", "open", "paused", "scheduled_only", "suspended"] as const;
export type UnitState = (typeof UNIT_STATES)[number];

export const UNIT_STATE_LABELS: Record<UnitState, string> = {
  setup: "Em configuração",
  closed: "Fechada",
  open: "Aberta para pedidos",
  paused: "Pausada",
  scheduled_only: "Somente agendados",
  suspended: "Suspensa",
};

export const WEEKDAYS = [
  { value: 0, label: "Domingo", short: "Dom" },
  { value: 1, label: "Segunda", short: "Seg" },
  { value: 2, label: "Terça", short: "Ter" },
  { value: 3, label: "Quarta", short: "Qua" },
  { value: 4, label: "Quinta", short: "Qui" },
  { value: 5, label: "Sexta", short: "Sex" },
  { value: 6, label: "Sábado", short: "Sáb" },
] as const;

export const TIMEZONES = [
  "America/Sao_Paulo",
  "America/Manaus",
  "America/Cuiaba",
  "America/Belem",
  "America/Fortaleza",
  "America/Bahia",
  "America/Recife",
  "America/Rio_Branco",
  "America/Noronha",
] as const;

/** Fuso horário sugerido a partir da UF da empresa. */
const UF_TIMEZONE: Record<string, (typeof TIMEZONES)[number]> = {
  AC: "America/Rio_Branco",
  AM: "America/Manaus",
  RR: "America/Manaus",
  RO: "America/Manaus",
  MT: "America/Cuiaba",
  MS: "America/Cuiaba",
  PA: "America/Belem",
  AP: "America/Belem",
  MA: "America/Fortaleza",
  PI: "America/Fortaleza",
  CE: "America/Fortaleza",
  RN: "America/Fortaleza",
  PB: "America/Fortaleza",
  PE: "America/Recife",
  AL: "America/Maceio" as never,
  BA: "America/Bahia",
  SE: "America/Bahia",
};

export function timezoneForUf(uf?: string | null): (typeof TIMEZONES)[number] {
  const key = (uf ?? "").trim().toUpperCase();
  const tz = UF_TIMEZONE[key];
  return tz && (TIMEZONES as readonly string[]).includes(tz) ? tz : TIMEZONES[0];
}

/** Monta o endereço da unidade a partir das partes cadastradas na empresa. */
export function composeCompanyAddress(company: {
  logradouro?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  address?: string | null;
}): string {
  const street = [company.logradouro, company.numero].filter(Boolean).join(", ");
  const parts = [street, company.complemento, company.bairro].filter(
    (p) => typeof p === "string" && p.trim().length > 0,
  ) as string[];
  const composed = parts.join(" — ").trim();
  return composed || (company.address ?? "").trim();
}


export interface HourPeriod {
  weekday: number;
  opens_at: string; // HH:MM
  closes_at: string; // HH:MM
}

export interface HourException {
  exception_date: string; // YYYY-MM-DD
  is_closed: boolean;
  opens_at?: string | null;
  closes_at?: string | null;
  note?: string | null;
}

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isValidTime(value: string): boolean {
  return TIME_RE.test(value);
}

export function timeToMinutes(value: string): number {
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
}

/** Valida um conjunto de períodos: formato, ordem e sobreposição por dia. */
export function validateHourPeriods(periods: HourPeriod[]): string[] {
  const errors: string[] = [];
  if (periods.length === 0) return ["Configure ao menos um período de funcionamento."];

  periods.forEach((p) => {
    const dayLabel = WEEKDAYS.find((d) => d.value === p.weekday)?.label ?? `Dia ${p.weekday}`;
    if (p.weekday < 0 || p.weekday > 6) errors.push(`Dia da semana inválido (${p.weekday}).`);
    if (!isValidTime(p.opens_at) || !isValidTime(p.closes_at)) {
      errors.push(`${dayLabel}: informe horários válidos no formato HH:MM.`);
      return;
    }
    if (timeToMinutes(p.closes_at) <= timeToMinutes(p.opens_at)) {
      errors.push(`${dayLabel}: o fechamento deve ser depois da abertura (turnos que viram o dia devem ser divididos em dois períodos).`);
    }
  });

  const byDay = new Map<number, HourPeriod[]>();
  periods.forEach((p) => {
    if (!isValidTime(p.opens_at) || !isValidTime(p.closes_at)) return;
    byDay.set(p.weekday, [...(byDay.get(p.weekday) ?? []), p]);
  });

  byDay.forEach((list, weekday) => {
    const dayLabel = WEEKDAYS.find((d) => d.value === weekday)?.label ?? `Dia ${weekday}`;
    const sorted = [...list].sort((a, b) => timeToMinutes(a.opens_at) - timeToMinutes(b.opens_at));
    for (let i = 1; i < sorted.length; i++) {
      if (timeToMinutes(sorted[i].opens_at) < timeToMinutes(sorted[i - 1].closes_at)) {
        errors.push(`${dayLabel}: períodos sobrepostos (${sorted[i - 1].opens_at}-${sorted[i - 1].closes_at} e ${sorted[i].opens_at}-${sorted[i].closes_at}).`);
      }
    }
  });

  return [...new Set(errors)];
}

export function validateHourExceptions(exceptions: HourException[]): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  exceptions.forEach((e) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(e.exception_date)) {
      errors.push("Informe uma data válida para a exceção de calendário.");
      return;
    }
    if (seen.has(e.exception_date)) {
      errors.push(`Data repetida na lista de exceções (${e.exception_date}).`);
    }
    seen.add(e.exception_date);
    if (!e.is_closed) {
      if (!e.opens_at || !e.closes_at || !isValidTime(e.opens_at) || !isValidTime(e.closes_at)) {
        errors.push(`${e.exception_date}: informe abertura e fechamento do horário especial.`);
      } else if (timeToMinutes(e.closes_at) <= timeToMinutes(e.opens_at)) {
        errors.push(`${e.exception_date}: o fechamento deve ser depois da abertura.`);
      }
    }
    if (e.note && e.note.length > 200) {
      errors.push(`${e.exception_date}: observação muito longa (máx. 200 caracteres).`);
    }
  });
  return [...new Set(errors)];
}

/** Dados obrigatórios da etapa 1 (cadastro da operação). */
export function validateUnitIdentity(input: {
  nome: string;
  timezone: string;
  codigo_interno?: string | null;
  uf?: string | null;
}): string[] {
  const errors: string[] = [];
  const nome = input.nome.trim();
  if (!nome) errors.push("Informe o nome da unidade.");
  if (nome.length > 120) errors.push("O nome da unidade deve ter até 120 caracteres.");
  if (!(TIMEZONES as readonly string[]).includes(input.timezone)) {
    errors.push("Selecione um fuso horário válido para a unidade.");
  }
  const codigo = input.codigo_interno?.trim();
  if (codigo && codigo.length > 30) errors.push("O código interno deve ter até 30 caracteres.");
  const uf = input.uf?.trim();
  if (uf && uf.length !== 2) errors.push("UF deve ter 2 letras.");
  return errors;
}

export function isValidMenuUrl(url: string): boolean {
  return /^https?:\/\/.{3,500}$/i.test(url.trim());
}

// ---------------- Checklist ----------------

export const CHECKLIST_ITEMS = [
  "company_active",
  "subscription_valid",
  "unit_not_suspended",
  "fulfillment_mode",
  "schedule",
  "channel",
  "menu",
  "payment",
  "responsible",
  "test_order",
] as const;
export type ChecklistItem = (typeof CHECKLIST_ITEMS)[number];

export const CHECKLIST_LABELS: Record<ChecklistItem, string> = {
  company_active: "Empresa ativa",
  subscription_valid: "Assinatura ou teste válido",
  unit_not_suspended: "Unidade ativa (não suspensa)",
  fulfillment_mode: "Forma de atendimento definida",
  schedule: "Horário de funcionamento configurado",
  channel: "Canal de pedidos ativo",
  menu: "Cardápio próprio ou link externo",
  payment: "Forma de recebimento cadastrada",
  responsible: "Usuário responsável definido",
  test_order: "Pedido de teste concluído",
};

export interface UnitChecklist {
  unit_id: string;
  operational_state: UnitState;
  onboarding_step: number;
  ready: boolean;
  items: Record<ChecklistItem, boolean>;
  optional: Record<string, boolean>;
}

/** Espelho do cálculo do backend: só está pronta quando todos os itens são true. */
export function isChecklistReady(items: Partial<Record<ChecklistItem, boolean>>): boolean {
  return CHECKLIST_ITEMS.every((key) => items[key] === true);
}

export function missingChecklistItems(
  items: Partial<Record<ChecklistItem, boolean>>,
): ChecklistItem[] {
  return CHECKLIST_ITEMS.filter((key) => items[key] !== true);
}

export const ONBOARDING_STEPS = [
  { step: 1, title: "Cadastre sua operação", desc: "Unidade, responsável e endereço." },
  { step: 2, title: "Configure sua unidade", desc: "Atendimento, horários e preparo." },
  { step: 3, title: "Prepare o recebimento", desc: "Pagamentos, som e notificações." },
  { step: 4, title: "Teste e abra a unidade", desc: "Checklist, pedido simulado e abertura." },
] as const;

export function onboardingProgress(step: number, activated: boolean): number {
  if (activated) return 100;
  const clamped = Math.min(Math.max(step, 1), 5);
  return Math.round(((clamped - 1) / 4) * 100);
}
