import type { DiaConfig } from "@/lib/dp/config-trabalho";
import type { HorarioSimples } from "@/lib/dp/turno-resolver";

export interface ModeloHorarioRanking {
  cargo_id: string | null;
  horario: HorarioSimples | null;
  dias: DiaConfig[];
  folga_variavel: boolean;
  usado_em: string;
}

export function assinaturaModeloHorario(modelo: ModeloHorarioRanking): string {
  return JSON.stringify({
    horario: modelo.horario,
    folga_variavel: modelo.folga_variavel,
    dias: [...modelo.dias]
      .sort((a, b) => a.dow - b.dow)
      .map(({ dow, trabalha, turno_id, entrada, saida, intervalo_minutos }) => ({
        dow, trabalha, turno_id, entrada, saida, intervalo_minutos,
      })),
  });
}

/**
 * Mais frequente no cargo; sem histórico no cargo, mais frequente na lista.
 *
 * O desempate começa pelo horário base mais repetido entre os colaboradores —
 * dois colegas com o mesmo horário base e escalas diárias diferentes não podem
 * fazer o mais recente ganhar do horário que a loja realmente usa.
 */
export function sugerirModeloHorario<T extends ModeloHorarioRanking>(modelos: T[], cargoId?: string | null): T | null {
  const candidatosCargo = cargoId ? modelos.filter((m) => m.cargo_id === cargoId) : [];
  const todos = candidatosCargo.length > 0 ? candidatosCargo : modelos;
  const baseComum = horarioBaseMaisComum(todos);
  const noBase = baseComum
    ? todos.filter((m) => m.horario && chaveHorarioBase(m.horario) === chaveHorarioBase(baseComum))
    : [];
  const candidatos = noBase.length > 0 ? noBase : todos;
  const grupos = new Map<string, { quantidade: number; recente: string; modelo: T }>();

  for (const modelo of candidatos) {
    if (!modelo.horario) continue;
    const assinatura = assinaturaModeloHorario(modelo);
    const atual = grupos.get(assinatura);
    if (!atual) grupos.set(assinatura, { quantidade: 1, recente: modelo.usado_em, modelo });
    else {
      atual.quantidade += 1;
      if (modelo.usado_em > atual.recente) {
        atual.recente = modelo.usado_em;
        atual.modelo = modelo;
      }
    }
  }
  return [...grupos.values()]
    .sort((a, b) => b.quantidade - a.quantidade || b.recente.localeCompare(a.recente))[0]?.modelo ?? null;
}
/** Chave de comparação do horário base (entrada, saída e intervalo). */
export function chaveHorarioBase(h: HorarioSimples): string {
  return `${h.entrada.slice(0, 5)}|${h.saida.slice(0, 5)}|${Math.max(0, h.intervalo_minutos || 0)}`;
}

export interface ContagemHorarioBase {
  horario: HorarioSimples;
  /** Quantos colaboradores usam esse horário base. */
  quantidade: number;
  recente: string;
}

/**
 * Quantos colaboradores usam cada horário base — o "horário da loja" de fato é
 * o que mais se repete, não o primeiro cadastrado.
 */
export function contarHorariosBase<T extends ModeloHorarioRanking>(modelos: T[]): Map<string, ContagemHorarioBase> {
  const out = new Map<string, ContagemHorarioBase>();
  for (const m of modelos) {
    if (!m.horario) continue;
    const chave = chaveHorarioBase(m.horario);
    const atual = out.get(chave);
    if (!atual) out.set(chave, { horario: m.horario, quantidade: 1, recente: m.usado_em });
    else {
      atual.quantidade += 1;
      if ((m.usado_em ?? "") > atual.recente) atual.recente = m.usado_em;
    }
  }
  return out;
}

/**
 * Horário base mais repetido entre os colaboradores: primeiro no cargo, depois
 * em toda a lista recebida (unidade/empresa). Empate resolvido pelo uso recente.
 */
export function horarioBaseMaisComum<T extends ModeloHorarioRanking>(
  modelos: T[],
  cargoId?: string | null,
): HorarioSimples | null {
  const doCargo = cargoId ? modelos.filter((m) => m.cargo_id === cargoId && m.horario) : [];
  const escopo = doCargo.length > 0 ? doCargo : modelos;
  const contagem = [...contarHorariosBase(escopo).values()]
    .sort((a, b) => b.quantidade - a.quantidade || (b.recente ?? "").localeCompare(a.recente ?? ""));
  return contagem[0]?.horario ?? null;
}

/**
 * Quantos colaboradores usam cada horário — considerando o horário base e os
 * horários próprios de cada dia da semana. Cada colaborador conta uma vez por
 * horário. Serve para dizer se um horário é da loja (vários usam) ou próprio.
 */
export function contarHorariosUsados<T extends ModeloHorarioRanking>(modelos: T[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const m of modelos) {
    const chaves = new Set<string>();
    if (m.horario?.entrada && m.horario?.saida) chaves.add(chaveHorarioBase(m.horario));
    for (const d of m.dias ?? []) {
      if (!d.trabalha || !d.entrada || !d.saida) continue;
      chaves.add(chaveHorarioBase({
        entrada: String(d.entrada),
        saida: String(d.saida),
        intervalo_minutos: d.intervalo_minutos ?? 0,
      }));
    }
    for (const chave of chaves) out.set(chave, (out.get(chave) ?? 0) + 1);
  }
  return out;
}
