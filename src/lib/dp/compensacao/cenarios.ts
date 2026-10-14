/**
 * Cenários de folga compensatória (pura, sem banco). Cada grupo = uma jornada
 * de carga fixa, já separada em dias de pico (sex/sáb/dom) e de meio de semana.
 * As folgas podem cair em semanas diferentes: `max` = dias do grupo × semanas.
 */
export interface GrupoJornada {
  rotulo: string;
  minutos: number;
  pico: boolean;
  max: number;
}

export type TipoCenario = "meio_semana" | "menor_sobra" | "fim_semana";

export interface Cenario {
  tipo: TipoCenario;
  itens: { rotulo: string; minutos: number; pico: boolean; n: number }[];
  dias: number;
  minutosUsados: number;
  saldoFinal: number;
}

/** Melhor combinação: menor |saldo final| → menos folgas → menos dias de pico. */
export function melhorCombinacao(
  grupos: GrupoJornada[],
  saldo: number,
  limite = 0,
  maxDias = 30,
  exigeMisto = false,
): Omit<Cenario, "tipo"> | null {
  const gs = grupos.filter((g) => g.minutos > 0 && g.max > 0);
  const teto = saldo + Math.max(0, limite);
  if (teto <= 0 || !gs.length) return null;
  let best: { n: number[]; soma: number } | null = null;
  const n = gs.map(() => 0);
  const score = (soma: number, dias: number, picos: number) => [Math.abs(saldo - soma), dias, picos];
  const melhor = (soma: number) => {
    const dias = n.reduce((s, x) => s + x, 0);
    if (!dias) return;
    const picos = n.reduce((s, x, i) => s + (gs[i].pico ? x : 0), 0);
    if (exigeMisto && (picos === 0 || picos === dias)) return;
    if (best) {
      const bd = best.n.reduce((s, x) => s + x, 0);
      const bp = best.n.reduce((s, x, i) => s + (gs[i].pico ? x : 0), 0);
      const a = score(soma, dias, picos), b = score(best.soma, bd, bp);
      for (let k = 0; k < 3; k++) { if (a[k] < b[k]) break; if (a[k] > b[k]) return; if (k === 2) return; }
    }
    best = { n: [...n], soma };
  };
  const rec = (i: number, soma: number, dias: number) => {
    if (i === gs.length) { melhor(soma); return; }
    for (let k = 0; k <= gs[i].max && dias + k <= maxDias; k++) {
      const s = soma + k * gs[i].minutos;
      if (s > teto) break;
      n[i] = k;
      rec(i + 1, s, dias + k);
    }
    n[i] = 0;
  };
  rec(0, 0, 0);
  if (!best) return null;
  const b = best as { n: number[]; soma: number };
  return {
    itens: gs.map((g, i) => ({ rotulo: g.rotulo, minutos: g.minutos, pico: g.pico, n: b.n[i] })).filter((x) => x.n > 0),
    dias: b.n.reduce((s, x) => s + x, 0),
    minutosUsados: b.soma,
    saldoFinal: saldo - b.soma,
  };
}

const assinatura = (c: Omit<Cenario, "tipo">) => c.itens.map((i) => `${i.rotulo}:${i.n}`).sort().join("|");

/**
 * 1) Só meio de semana; 2) menor saldo restante mesclando meio e fim de semana; 3) só fim de semana.
 * Cenário igual a um anterior não se repete.
 */
export function cenariosCompensacao(grupos: GrupoJornada[], saldo: number, limite = 0): Cenario[] {
  const brutos: [TipoCenario, Omit<Cenario, "tipo"> | null][] = [
    ["meio_semana", melhorCombinacao(grupos.filter((g) => !g.pico), saldo, limite)],
    ["menor_sobra", melhorCombinacao(grupos, saldo, limite, 30, grupos.some((g) => g.pico) && grupos.some((g) => !g.pico))],
    ["fim_semana", melhorCombinacao(grupos.filter((g) => g.pico), saldo, limite)],
  ];
  const vistos = new Set<string>();
  const out: Cenario[] = [];
  for (const [tipo, c] of brutos) {
    if (!c) continue;
    const k = assinatura(c);
    if (vistos.has(k)) continue;
    vistos.add(k);
    out.push({ tipo, ...c });
  }
  return out;
}
