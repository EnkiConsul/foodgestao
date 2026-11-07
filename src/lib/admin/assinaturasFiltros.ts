import { isExempt } from "@/lib/billing";
import { parseFlexibleDate } from "@/lib/date-utils";

/** Filtros de análise do Backoffice > Assinaturas (somente navegador). */
export const STATUS_VIGENTES = ["trialing", "active", "grace", "past_due"];
export const MODULOS = ["financeiro", "pessoas"] as const;
export const PLANOS = ["essencial", "gestao", "multiempresa", "enterprise"] as const;
export const PLANO_LABEL: Record<string, string> = { essencial: "Essencial", gestao: "Gestão", multiempresa: "Multiempresa", enterprise: "Enterprise" };
export const COBRANCAS = ["pagantes", "nao_cobrado", "isentos"] as const;
export const COBRANCA_LABEL: Record<string, string> = { pagantes: "Pagando agora", nao_cobrado: "Em carência ou trial", isentos: "Isentos (cortesia)" };

/** Grupo de cobrança: cada assinatura cai em exatamente um. */
export type GrupoCobranca = "pagando" | "carencia" | "trial" | "isento" | "outro";
export function grupoCobranca(s: any): GrupoCobranca {
  if (isExempt(s)) return "isento";
  if (s.status === "active" || s.status === "past_due") return "pagando";
  if (s.status === "grace") return "carencia";
  if (s.status === "trialing") return "trial";
  return "outro";
}
export const FORMAS = ["automatica", "manual"] as const;
export const ATALHOS = ["vence7", "trial3", "carencia", "inadimplentes", "adicionais", "cortesia30"] as const;
export const ATALHO_LABEL: Record<string, string> = {
  vence7: "Vence em 7 dias",
  trial3: "Trial acabando",
  carencia: "Em carência",
  inadimplentes: "Inadimplentes",
  adicionais: "Com adicionais",
  cortesia30: "Cortesia vencendo",
};
export const VINCULOS = ["colaborador", "admin", "nenhum"] as const;

export const norm = (v: unknown) =>
  String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
export const digits = (v: unknown) => String(v ?? "").replace(/\D/g, "");

export const addonsCents = (s: any) =>
  (s.addons ?? [])
    .filter((a: any) => a.status === "active" && !a.is_exempt)
    .reduce((t: number, a: any) => t + Number(a.price_cents ?? 0) * Number(a.quantity ?? 1), 0);
export const planCents = (s: any) => Number(s.plan?.price_cents ?? 0);
export const valorMes = (s: any) => planCents(s) + addonsCents(s);
export const activeAddons = (s: any) => (s.addons ?? []).filter((a: any) => a.status === "active").length;

/** Agrupa o plano pelo nome (Essencial / Gestão / Multiempresa). */
export function planoChave(s: any): string | null {
  const n = norm(s.plan?.name ?? s.plan?.slug);
  if (n.includes("enterprise")) return "enterprise";
  if (n.includes("multi")) return "multiempresa";
  if (n.includes("gest")) return "gestao";
  if (n.includes("essen")) return "essencial";
  return null;
}

const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;
const pick = <T extends string>(v: string | null, ok: readonly T[]): T | "" => (v && (ok as readonly string[]).includes(v) ? (v as T) : "");
const pickDate = (v: string | null) => (v && DATA_RE.test(v) && parseFlexibleDate(v) ? v : "");

export interface FiltrosContratantes {
  q: string; status: string; modulo: string; plano: string; cobranca: string; forma: string;
  atalhos: string[]; ini_de: string; ini_ate: string; venc_de: string; venc_ate: string;
}
export const PADRAO_CONTRATANTES: FiltrosContratantes = {
  q: "", status: "vigentes", modulo: "", plano: "", cobranca: "", forma: "",
  atalhos: [], ini_de: "", ini_ate: "", venc_de: "", venc_ate: "",
};
export interface FiltrosSem { sq: string; sstatus: string; vinculo: string; cad_de: string; cad_ate: string }
export const PADRAO_SEM: FiltrosSem = { sq: "", sstatus: "all", vinculo: "", cad_de: "", cad_ate: "" };

export function lerContratantes(p: URLSearchParams, statusValidos: string[]): FiltrosContratantes {
  const st = p.get("status");
  const statusOk = st && (st === "all" || st === "vigentes" || statusValidos.includes(st)) ? st : "vigentes";
  const modulo = pick(p.get("modulo"), MODULOS);
  return {
    q: (p.get("q") ?? "").slice(0, 120),
    status: statusOk,
    modulo,
    plano: pick(p.get("plano"), PLANOS),
    cobranca: pick(p.get("cobranca"), COBRANCAS),
    forma: pick(p.get("forma"), FORMAS),
    atalhos: Array.from(new Set((p.get("atalhos") ?? "").split(",").filter((a) => (ATALHOS as readonly string[]).includes(a)))),
    ini_de: pickDate(p.get("ini_de")), ini_ate: pickDate(p.get("ini_ate")),
    venc_de: pickDate(p.get("venc_de")), venc_ate: pickDate(p.get("venc_ate")),
  };
}
export function lerSem(p: URLSearchParams, statusValidos: string[]): FiltrosSem {
  const st = p.get("status");
  return {
    sq: (p.get("q") ?? "").slice(0, 120),
    sstatus: st && (st === "all" || statusValidos.includes(st)) ? st : "all",
    vinculo: pick(p.get("vinculo"), VINCULOS),
    cad_de: pickDate(p.get("cad_de")), cad_ate: pickDate(p.get("cad_ate")),
  };
}

/** Grava só o que difere do padrão; preserva parâmetros alheios (ex.: aba). */
export function escrever(base: URLSearchParams, valores: Record<string, string | string[]>, padrao: Record<string, string | string[]>, chaves: Record<string, string>) {
  const out = new URLSearchParams(base);
  for (const [k, urlKey] of Object.entries(chaves)) {
    const v = valores[k];
    const s = Array.isArray(v) ? v.join(",") : v;
    const d = Array.isArray(padrao[k]) ? (padrao[k] as string[]).join(",") : (padrao[k] as string);
    if (!s || s === d) out.delete(urlKey); else out.set(urlKey, s);
  }
  return out;
}

export function contarAtivos(f: Record<string, any>, padrao: Record<string, any>) {
  let n = 0;
  for (const k of Object.keys(padrao)) {
    if (Array.isArray(padrao[k])) n += (f[k] as string[]).length;
    else if (f[k] !== padrao[k]) n += 1;
  }
  return n;
}

const dia = (v: unknown) => parseFlexibleDate(v as any, "midday");
const inicioDia = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
function entre(v: unknown, de: string, ate: string) {
  if (!de && !ate) return true;
  const d = dia(v);
  if (!d) return false;
  const t = inicioDia(d);
  if (de && t < inicioDia(dia(de)!)) return false;
  if (ate && t > inicioDia(dia(ate)!)) return false;
  return true;
}
function nosProximos(v: unknown, dias: number, hoje: Date) {
  const d = dia(v);
  if (!d) return false;
  const t = inicioDia(d), h = inicioDia(hoje);
  return t >= h && t <= h + dias * 86400000;
}

export function casaAtalho(a: string, s: any, hoje: Date) {
  switch (a) {
    case "vence7": return !["canceled", "expired"].includes(s.status) && nosProximos(s.current_period_end, 7, hoje);
    case "trial3": return s.status === "trialing" && nosProximos(s.trial_ends_at, 3, hoje);
    case "carencia": return s.status === "grace";
    case "inadimplentes": return s.status === "past_due";
    case "adicionais": return activeAddons(s) > 0;
    case "cortesia30": return !!s.is_exempt && nosProximos(s.exempt_until, 30, hoje);
    default: return true;
  }
}

export function filtrarContratantes(rows: any[], f: FiltrosContratantes, nome: (uid: string) => string, hoje = new Date()) {
  const q = norm(f.q), qd = digits(f.q);
  return rows.filter((s) => {
    if (f.status === "vigentes" ? !STATUS_VIGENTES.includes(s.status) : f.status !== "all" && s.status !== f.status) return false;
    if (f.modulo && (s.module ?? "financeiro") !== f.modulo) return false;
    if (f.plano && planoChave(s) !== f.plano) return false;
    const g = grupoCobranca(s);
    if (f.cobranca === "pagantes" && g !== "pagando") return false;
    if (f.cobranca === "nao_cobrado" && g !== "carencia" && g !== "trial") return false;
    if (f.cobranca === "isentos" && g !== "isento") return false;
    if (f.forma === "automatica" && !s.external_subscription_id) return false;
    if (f.forma === "manual" && s.external_subscription_id) return false;
    if (!f.atalhos.every((a) => casaAtalho(a, s, hoje))) return false;
    if (!entre(s.started_at, f.ini_de, f.ini_ate)) return false;
    if (!entre(s.current_period_end, f.venc_de, f.venc_ate)) return false;
    if (q) {
      const txt = [s.company?.trade_name, s.company?.name, nome(s.user_id), s.email].map(norm).join(" ");
      const hit = txt.includes(q) || (qd.length >= 3 && digits(s.company?.cnpj).includes(qd));
      if (!hit) return false;
    }
    return true;
  });
}

export function filtrarSem(rows: any[], f: FiltrosSem, nome: (uid: string) => string) {
  const q = norm(f.sq);
  return rows.filter((s) => {
    if (f.sstatus !== "all" && s.status !== f.sstatus) return false;
    if (f.vinculo === "colaborador" && !s.is_colaborador) return false;
    if (f.vinculo === "admin" && (s.is_colaborador || !s.is_equipe_admin)) return false;
    if (f.vinculo === "nenhum" && (s.is_colaborador || s.is_equipe_admin)) return false;
    if (!entre(s.cadastro_em ?? s.created_at, f.cad_de, f.cad_ate)) return false;
    if (q && !`${norm(nome(s.user_id))} ${norm(s.email)}`.includes(q)) return false;
    return true;
  });
}

export function resumo(rows: any[]) {
  const g = { pagando: [0, 0], carencia: [0, 0], trial: [0, 0], isento: [0, 0], outro: [0, 0] } as Record<GrupoCobranca, [number, number]>;
  for (const s of rows) { const k = grupoCobranca(s); g[k][0] += 1; g[k][1] += valorMes(s); }
  return {
    total: rows.length,
    pagando: g.pagando[0], pagandoCents: g.pagando[1],
    carencia: g.carencia[0], carenciaCents: g.carencia[1],
    trial: g.trial[0], trialCents: g.trial[1],
    isentos: g.isento[0],
    outros: g.outro[0],
    receitaEmVigorCents: g.pagando[1],
    aReceberCents: g.carencia[1] + g.trial[1],
  };
}

export type ColunaOrdem = "empresa" | "titular" | "valor" | "inicio" | "vence" | "trial";
export function ordenar(rows: any[], col: ColunaOrdem | null, dir: "asc" | "desc" | null, nome: (uid: string) => string) {
  if (!col || !dir) return rows;
  const txt = (s: any) =>
    col === "empresa" ? s.company?.trade_name || s.company?.name || "" : nome(s.user_id) || s.user_id?.slice(0, 8) || "";
  const num = (s: any): number | null => {
    if (col === "valor") return isExempt(s) ? 0 : valorMes(s);
    const v = col === "inicio" ? s.started_at : col === "vence" ? s.current_period_end : s.trial_ends_at;
    return dia(v)?.getTime() ?? null;
  };
  const sinal = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    if (col === "empresa" || col === "titular") return sinal * txt(a).localeCompare(txt(b), "pt-BR", { sensitivity: "base" });
    const x = num(a), y = num(b);
    if (x === null && y === null) return 0;
    if (x === null) return 1; // vazios sempre no fim
    if (y === null) return -1;
    return sinal * (x - y);
  });
}
