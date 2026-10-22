/**
 * Jornada semanal oficial (minutos por dia, 0 = domingo) a partir da
 * configuração de trabalho cadastrada. Puro e sem aliases (navegador e Deno).
 * Mesma regra de `turnoDoDia` + `cargaLiquidaHoras` (paridade coberta por teste).
 * Nunca inventa horário: dia trabalhado sem horário resolvível vai para `incompletos`.
 */
export interface DiaConfigMin {
  dow: number;
  trabalha: boolean;
  turno_id: string | null;
  entrada?: string | null;
  saida?: string | null;
  intervalo_minutos?: number | null;
}
export interface TurnoMin {
  id: string;
  entrada: string;
  saida: string;
  intervalo_minutos: number | null;
}

function paraMin(v: string | null | undefined): number | null {
  if (!v) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(v);
  if (!m) return null;
  const h = Number(m[1]), mm = Number(m[2]);
  return h > 23 || mm > 59 ? null : h * 60 + mm;
}
function cargaMin(entrada: string, saida: string, intervalo: number): number {
  const e = paraMin(entrada), s = paraMin(saida);
  if (e === null || s === null) return 0;
  const bruto = s <= e ? s - e + 1440 : s - e;
  const horas = Math.round((Math.max(0, bruto - Math.max(0, intervalo || 0)) / 60) * 100) / 100;
  return Math.round(horas * 60);
}

export function jornadaSemanalDaConfig(
  dias: DiaConfigMin[],
  turnoPadraoId: string | null,
  turnos: TurnoMin[],
): { semana: [number, number, number, number, number, number, number]; incompletos: number[] } {
  const semana: [number, number, number, number, number, number, number] = [0, 0, 0, 0, 0, 0, 0];
  const incompletos: number[] = [];
  for (const d of dias) {
    if (d.dow < 0 || d.dow > 6 || !d.trabalha) continue;
    const id = d.turno_id ?? turnoPadraoId;
    const base = id ? turnos.find((t) => t.id === id) ?? null : null;
    const proprio = !!d.entrada && !!d.saida;
    const min = proprio
      ? cargaMin(String(d.entrada), String(d.saida), d.intervalo_minutos ?? base?.intervalo_minutos ?? 0)
      : base ? cargaMin(String(base.entrada), String(base.saida), base.intervalo_minutos ?? 0) : 0;
    if (min <= 0) { incompletos.push(d.dow); continue; }
    semana[d.dow] = min;
  }
  return { semana, incompletos };
}

/** Configuração vigente na data: início ≤ data e (sem fim ou fim ≥ data); a mais recente. */
export function configVigenteEm<T extends { vigencia_inicio: string; vigencia_fim: string | null }>(cfgs: T[], data: string): T | null {
  const ok = cfgs.filter((c) => c.vigencia_inicio <= data && (!c.vigencia_fim || c.vigencia_fim >= data));
  ok.sort((a, b) => (a.vigencia_inicio < b.vigencia_inicio ? 1 : -1));
  return ok[0] ?? null;
}
