// Regras de negócio para folgas do 360°FOOD.

export type DateStatusKind =
  | "available"
  | "blocked"
  | "taken"
  | "mine"
  | "past"
  | "birthday"
  | "pending"
  | "fixed"
  | "swapped"
  | "weekday";

export interface DateStatus {
  status: DateStatusKind;
  reason?: string;
  label?: string;
  occupancy?: number;
  limit?: number;
  adminCanOverride?: boolean;
}

export interface FolgaRecord {
  colaborador_id: string;
  data: string;
  tipo?: string | null;
  extra?: boolean | null;
}

export interface ColaboradorRecord {
  id: string;
  nome?: string | null;
  folga_fixa_semana: number | null;
  ativo?: boolean | null;
  unidade_id?: string | null;
}

export type OccupantType = "fixed" | "monthly" | "pending";

export interface DayOccupant {
  key: string;
  colaboradorId: string;
  colaboradorNome: string;
  type: OccupantType;
  origin: string;
  folgaId?: string;
  extra?: boolean;
}

// ---- helpers ----
export function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseYMD(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function isWeekend(d: Date): boolean {
  const w = d.getDay();
  return w === 0 || w === 6;
}

export function dayType(d: Date): "sabado" | "domingo" | null {
  const w = d.getDay();
  if (w === 6) return "sabado";
  if (w === 0) return "domingo";
  return null;
}

export function formatBR(d: Date): string {
  return d.toLocaleDateString("pt-BR");
}

export function getWeekStart(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

export function isSameWeek(d1: Date, d2: Date): boolean {
  return getWeekStart(d1).getTime() === getWeekStart(d2).getTime();
}

export function getMonthDays(year: number, month0: number): Date[] {
  const days: Date[] = [];
  const last = new Date(year, month0 + 1, 0).getDate();
  for (let i = 1; i <= last; i++) days.push(new Date(year, month0, i));
  return days;
}

/** Normaliza o valor do dia da semana lido do banco (pode vir como string legado). */
export function normalizeWeekday(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return null;
  if (n < 0 || n > 6) return null;
  return n;
}

/** Constrói o mapa de ocupantes por dia (fixadas + monthly + pendentes) para um intervalo. */
export function buildOccupantsByDate(params: {
  days: Date[];
  colaboradores: ColaboradorRecord[];
  folgas: Array<
    FolgaRecord & {
      id: string;
      origem?: string | null;
      criado_por?: string | null;
      dp_colaboradores?: { nome?: string | null; unidade_id?: string | null } | null;
    }
  >;
  pendentes: Array<{
    id: string;
    colaborador_id: string;
    data_alvo: string;
    dp_colaboradores?: { nome?: string | null; unidade_id?: string | null } | null;
  }>;
  filterUser?: string;
  filterType?: "all" | OccupantType;
}): Map<string, DayOccupant[]> {
  const {
    days,
    colaboradores,
    folgas,
    pendentes,
    filterUser = "all",
    filterType = "all",
  } = params;

  const m = new Map<string, DayOccupant[]>();
  const nameById = new Map(colaboradores.map((c) => [c.id, c.nome ?? "—"]));
  const validIds = new Set(colaboradores.map((c) => c.id));
  const push = (iso: string, occ: DayOccupant) => {
    const arr = m.get(iso) ?? [];
    arr.push(occ);
    m.set(iso, arr);
  };

  // 1) folgas fixas semanais (colaboradores ativos com folga_fixa_semana === weekday)
  if (filterType === "all" || filterType === "fixed") {
    for (const d of days) {
      const iso = ymd(d);
      const wd = d.getDay();
      for (const c of colaboradores) {
        if (c.ativo === false) continue;
        const fs = normalizeWeekday(c.folga_fixa_semana);
        if (fs == null || fs !== wd) continue;
        if (filterUser !== "all" && c.id !== filterUser) continue;
        push(iso, {
          key: `fixed:${c.id}:${iso}`,
          colaboradorId: c.id,
          colaboradorNome: c.nome ?? "—",
          type: "fixed",
          origin: "Folga Semanal",
        });
      }
    }
  }

  // 2) folgas registradas
  if (filterType === "all" || filterType === "monthly") {
    for (const f of folgas) {
      if (!validIds.has(f.colaborador_id)) continue;
      if (filterUser !== "all" && f.colaborador_id !== filterUser) continue;
      const origin = f.extra
        ? "Extra (Admin)"
        : f.origem === "sorteio"
          ? "Sorteio Automático"
          : f.criado_por
            ? "Atribuição Manual"
            : "Sorteio Automático";
      push(f.data, {
        key: `folga:${f.id}`,
        folgaId: f.id,
        colaboradorId: f.colaborador_id,
        colaboradorNome: f.dp_colaboradores?.nome ?? nameById.get(f.colaborador_id) ?? "—",
        type: "monthly",
        origin,
        extra: !!f.extra,
      });
    }
  }

  // 3) solicitações pendentes
  if (filterType === "all" || filterType === "pending") {
    for (const p of pendentes) {
      if (!p.data_alvo) continue;
      if (!validIds.has(p.colaborador_id)) continue;
      if (filterUser !== "all" && p.colaborador_id !== filterUser) continue;
      push(p.data_alvo, {
        key: `pend:${p.id}`,
        colaboradorId: p.colaborador_id,
        colaboradorNome: p.dp_colaboradores?.nome ?? nameById.get(p.colaborador_id) ?? "—",
        type: "pending",
        origin: "Solicitação Pendente",
      });
    }
  }

  return m;
}

export function calculateDateStatus(params: {
  date: Date;
  myColaboradorId: string | null;
  allFolgas?: FolgaRecord[];
  allColaboradores?: ColaboradorRecord[];
  manualBlocked?: Map<string, { reason: string; liberada: boolean }>;
  dayLimits?: Map<string, number>;
  birthdayByDate?: Map<string, { colaboradorId: string; status?: string }>;
  pendingRequests?: { data: string; colaborador_id?: string }[];
  canceledFolgas?: { colaborador_id: string; data: string }[];
  isAdmin: boolean;
  locked?: { unlockDateBR: string } | null;
  /** Dias da semana elegíveis para folga (0 = domingo). Default: sábado e domingo. */
  diasElegiveis?: number[];
  /** Teto de folgas que o colaborador pode marcar no mês (regra de frequência). */
  tetoMensal?: number;
}): DateStatus {
  const {
    date,
    myColaboradorId,
    allFolgas = [],
    allColaboradores = [],
    manualBlocked = new Map(),
    dayLimits = new Map(),
    birthdayByDate = new Map(),
    pendingRequests = [],
    canceledFolgas = [],
    isAdmin,
    locked,
    diasElegiveis,
    tetoMensal,
  } = params;

  const iso = ymd(date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (date < today) return { status: "past", reason: "Data passada" };

  const elegiveis = diasElegiveis && diasElegiveis.length > 0 ? diasElegiveis : [0, 6];
  const isWknd = elegiveis.includes(date.getDay());

  const birthday = birthdayByDate.get(iso);
  const isMyBirthday =
    !isAdmin &&
    myColaboradorId &&
    birthday &&
    birthday.colaboradorId === myColaboradorId &&
    birthday.status === "ativa";
  if (isMyBirthday && isWknd) {
    return { status: "available", label: "Seu aniversário", reason: "Data reservada para você", occupancy: 0, limit: 1 };
  }

  const manual = manualBlocked.get(iso);
  if (manual && !manual.liberada) {
    if (isAdmin) return { status: "blocked", reason: manual.reason, adminCanOverride: true };
    return { status: "blocked", reason: manual.reason };
  }

  const myFolga = myColaboradorId && allFolgas.find((f) => f.colaborador_id === myColaboradorId && f.data === iso);
  if (!isAdmin && myFolga) {
    const label = myFolga.tipo === "troca" ? "Troca Aprovada" : "Sua folga";
    return { status: myFolga.tipo === "troca" ? "swapped" : "mine", label, reason: label };
  }

  const myProfile = allColaboradores.find((p) => p.id === myColaboradorId);
  const isCanceled =
    myColaboradorId && canceledFolgas.some((c) => c.colaborador_id === myColaboradorId && c.data === iso);
  const myFixed = normalizeWeekday(myProfile?.folga_fixa_semana);
  const isMyFixed = !isAdmin && myFixed != null && myFixed === date.getDay() && !isCanceled;

  if (isMyFixed) {
    const hasOtherFolgaInSameWeek = allFolgas.some(
      (f) => f.colaborador_id === myColaboradorId && f.data !== iso && isSameWeek(date, parseYMD(f.data)),
    );
    if (!hasOtherFolgaInSameWeek) {
      return { status: "fixed", label: "Semanal", reason: "Sua folga semanal fixa" };
    }
    return { status: "weekday", label: "Já folgou na semana", reason: "Você já usou sua folga nesta semana" };
  }

  const hasMyPending =
    !isAdmin && pendingRequests.some((r) => r.data === iso && r.colaborador_id === myColaboradorId);
  if (!isAdmin && hasMyPending) return { status: "pending", label: "Pendente", reason: "Aguardando aprovação" };

  if (!isAdmin && locked && isWknd) {
    return { status: "blocked", reason: `Folgas ainda não liberadas (Abre em ${locked.unlockDateBR})` };
  }

  if (!isAdmin && isWknd && birthday && birthday.colaboradorId !== myColaboradorId && birthday.status === "ativa") {
    return { status: "birthday", label: "Indisponível", reason: "Reservado para aniversariante" };
  }

  const limit = dayLimits.get(iso) ?? 1;
  const monthlyCount = allFolgas.filter(
    (f) => f.data === iso && (f.tipo === "sabado" || f.tipo === "domingo" || f.tipo === "normal") && f.extra !== true,
  ).length;

  // Teto mensal do colaborador, derivado da frequência configurada nas regras.
  if (!isAdmin && isWknd && myColaboradorId && typeof tetoMensal === "number" && tetoMensal >= 0) {
    const mk = monthKey(date);
    const minhasNoMes = allFolgas.filter(
      (f) =>
        f.colaborador_id === myColaboradorId &&
        f.extra !== true &&
        monthKey(parseYMD(f.data)) === mk &&
        elegiveis.includes(parseYMD(f.data).getDay()),
    ).length;
    if (minhasNoMes >= tetoMensal) {
      return {
        status: "taken",
        label: "Teto do mês",
        reason: `Você já atingiu o teto de ${tetoMensal} folga(s) neste mês, conforme as regras de folga da sua unidade.`,
        occupancy: monthlyCount,
        limit,
      };
    }
  }

  if (!isAdmin && monthlyCount >= limit && isWknd) {
    return { status: "taken", label: "Lotado", reason: "Limite de folgas mensais atingido", occupancy: monthlyCount, limit };
  }


  return {
    status: isWknd ? "available" : "weekday",
    reason: isWknd ? "Disponível para seleção" : undefined,
    occupancy: monthlyCount,
    limit,
  };
}

export const MONTH_NAMES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

export const WEEKDAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
