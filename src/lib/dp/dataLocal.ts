// Data "de hoje" no fuso do Brasil (America/Sao_Paulo).
// Usar `new Date().toISOString()` mostra o dia seguinte a partir das 21h,
// o que fazia telas do portal abrirem no dia errado.

const FUSO = "America/Sao_Paulo";

/** Data local (AAAA-MM-DD) no fuso de São Paulo. */
export function hojeIsoLocal(agora: Date = new Date()): string {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: FUSO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(agora);
  return partes; // en-CA já formata como AAAA-MM-DD
}

/** Minutos desde 00:00 de um horário "HH:MM" ou "HH:MM:SS". */
export function minutosDoHorario(v: string | null | undefined): number | null {
  if (!v) return null;
  const [h, m] = v.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

/**
 * Dois horários se sobrepõem? Trata virada de madrugada (saída menor que entrada)
 * somando 24h à saída.
 */
export function horariosSobrepostos(
  a: { entrada: string | null; saida: string | null },
  b: { entrada: string | null; saida: string | null },
): boolean {
  const ai = minutosDoHorario(a.entrada);
  const bi = minutosDoHorario(b.entrada);
  if (ai == null || bi == null) return true; // sem horário definido, não filtra
  const af = (() => {
    const f = minutosDoHorario(a.saida);
    return f == null ? ai + 480 : f <= ai ? f + 1440 : f;
  })();
  const bf = (() => {
    const f = minutosDoHorario(b.saida);
    return f == null ? bi + 480 : f <= bi ? f + 1440 : f;
  })();
  return ai < bf && bi < af;
}
