// ------------------------------------------------------------------
// Domínio: DP → Convocações · aceite parcial de um dia
// Funções puras espelhando as regras aplicadas no banco:
// o horário parcial só pode ENCURTAR a janela pedida.
// ------------------------------------------------------------------

export interface JanelaHorario {
  entrada: string; // "HH:MM" ou "HH:MM:SS"
  saida: string;
  termina_no_dia_seguinte?: boolean | null;
}

export type MotivoParcialInvalido =
  | "HORARIO_INVALIDO"
  | "FORA_DA_JANELA"
  | "IGUAL_AO_COMPLETO"
  | "DURACAO_INVALIDA";

/** "HH:MM(:SS)" → minutos do dia. Retorna null quando o texto não é um horário. */
export function minutosDoHorario(v: string | null | undefined): number | null {
  if (!v) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(String(v));
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min) || h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** Janela em minutos absolutos, tratando virada de dia como no backend. */
export function janelaMinutos(j: JanelaHorario): { inicio: number; fim: number } | null {
  const inicio = minutosDoHorario(j.entrada);
  let fim = minutosDoHorario(j.saida);
  if (inicio === null || fim === null) return null;
  if (j.termina_no_dia_seguinte || fim <= inicio) fim += 1440;
  return { inicio, fim };
}

/** Valida a proposta parcial contra a necessidade. */
export function validarHorarioParcial(
  necessidade: JanelaHorario,
  parcial: JanelaHorario,
): { ok: true; minutos: number } | { ok: false; motivo: MotivoParcialInvalido } {
  const n = janelaMinutos(necessidade);
  const p = janelaMinutos(parcial);
  if (!n || !p) return { ok: false, motivo: "HORARIO_INVALIDO" };
  if (p.fim - p.inicio <= 0) return { ok: false, motivo: "DURACAO_INVALIDA" };
  if (p.inicio < n.inicio || p.fim > n.fim) return { ok: false, motivo: "FORA_DA_JANELA" };
  if (p.inicio === n.inicio && p.fim === n.fim) return { ok: false, motivo: "IGUAL_AO_COMPLETO" };
  return { ok: true, minutos: p.fim - p.inicio };
}

/** Trechos da necessidade que continuam descobertos, em minutos. */
export function trechosDescobertos(
  necessidade: JanelaHorario,
  parcial: JanelaHorario,
): { inicio: number; fim: number; total: number } | null {
  const n = janelaMinutos(necessidade);
  const p = janelaMinutos(parcial);
  if (!n || !p) return null;
  const inicio = Math.max(p.inicio - n.inicio, 0);
  const fim = Math.max(n.fim - p.fim, 0);
  return { inicio, fim, total: inicio + fim };
}

/** 95 → "1h35". */
export function formatarMinutos(min: number | null | undefined): string {
  if (min === null || min === undefined || !Number.isFinite(min)) return "—";
  const h = Math.floor(Math.abs(min) / 60);
  const m = Math.abs(min) % 60;
  if (!h) return `${m}min`;
  return m ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
}

export const MOTIVO_PARCIAL_TEXTO: Record<MotivoParcialInvalido, string> = {
  HORARIO_INVALIDO: "Informe entrada e saída válidas.",
  FORA_DA_JANELA: "O horário precisa ficar dentro do horário pedido — você só pode encurtar.",
  IGUAL_AO_COMPLETO: "Esse é o horário completo. Use “Aceitar” para confirmar o dia inteiro.",
  DURACAO_INVALIDA: "A duração precisa ser maior que zero.",
};

/** Rótulo do estado da proposta parcial. */
export const PARCIAL_STATUS_META: Record<
  string,
  { label: string; className: string }
> = {
  aguardando_gestor: {
    label: "Horário parcial · aguardando o gestor",
    className: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/40",
  },
  aprovada: {
    label: "Horário parcial aprovado",
    className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/40",
  },
  recusada: {
    label: "Horário parcial recusado",
    className: "bg-destructive/15 text-destructive border-destructive/40",
  },
  superada: {
    label: "Dia coberto por outra pessoa",
    className: "bg-muted text-muted-foreground border-border",
  },
};
