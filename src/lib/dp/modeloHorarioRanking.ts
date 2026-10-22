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

export interface SemanaBaseCargo {
  /** Horário base mais repetido no cargo (entrada, saída e intervalo). */
  horario: HorarioSimples;
  /** Dia da folga semanal (0 = domingo … 6 = sábado). Nunca gera semana 7x0. */
  folgaDow: number;
}

/**
 * Sugestão de semana para novo colaborador: o horário que MAIS se repete no
 * cargo, aplicado de forma uniforme em todos os dias trabalhados — sem copiar
 * exceções individuais de sexta/sábado/domingo de um colega específico.
 *
 * A folga semanal é o dia de folga mais comum entre os colegas do cargo que
 * usam esse horário; sem histórico, o dia menos trabalhado; em último caso,
 * segunda-feira. A semana sugerida tem sempre 6 dias de trabalho e 1 folga.
 */
export function sugerirSemanaBaseCargo<T extends ModeloHorarioRanking>(
  modelos: T[],
  cargoId?: string | null,
): SemanaBaseCargo | null {
  const horario = horarioBaseMaisComum(modelos, cargoId);
  if (!horario) return null;
  const doCargo = cargoId ? modelos.filter((m) => m.cargo_id === cargoId) : [];
  const escopo = doCargo.length > 0 ? doCargo : modelos;
  const chave = chaveHorarioBase(horario);
  const mesmoHorario = escopo.filter((m) => m.horario && chaveHorarioBase(m.horario) === chave);
  const base = mesmoHorario.length > 0 ? mesmoHorario : escopo;

  // Folga mais comum entre quem usa o horário; desempate pelo uso recente.
  const folgas = new Map<number, { quantidade: number; recente: string }>();
  for (const m of base) {
    for (const d of m.dias ?? []) {
      if (d.trabalha) continue;
      const atual = folgas.get(d.dow);
      if (!atual) folgas.set(d.dow, { quantidade: 1, recente: m.usado_em ?? "" });
      else {
        atual.quantidade += 1;
        if ((m.usado_em ?? "") > atual.recente) atual.recente = m.usado_em ?? "";
      }
    }
  }
  let folgaDow = [...folgas.entries()]
    .sort((a, b) => b[1].quantidade - a[1].quantidade || b[1].recente.localeCompare(a[1].recente))[0]?.[0];

  if (folgaDow === undefined) {
    // Sem folga registrada: usa o dia menos trabalhado; fallback segunda-feira.
    const trabalhados = new Map<number, number>();
    for (const m of base) for (const d of m.dias ?? []) {
      if (d.trabalha) trabalhados.set(d.dow, (trabalhados.get(d.dow) ?? 0) + 1);
    }
    folgaDow = [0, 1, 2, 3, 4, 5, 6]
      .map((dow) => ({ dow, n: trabalhados.get(dow) ?? 0 }))
      .sort((a, b) => a.n - b.n || (a.dow === 1 ? -1 : b.dow === 1 ? 1 : a.dow - b.dow))[0]?.dow ?? 1;
  }
  return { horario, folgaDow };
}

/**
 * Monta os 7 dias da semana com o horário base uniforme e a folga indicada:
 * todos os dias trabalhados usam exatamente o mesmo horário (sem variações de
 * fim de semana) e nenhum turno pré-vinculado — o gestor ajusta a folga com
 * um clique no dia, como já faz na rotina.
 */
export function montarSemanaUniforme(sugestao: SemanaBaseCargo): DiaConfig[] {
  return [0, 1, 2, 3, 4, 5, 6].map((dow) => {
    const trabalha = dow !== sugestao.folgaDow;
    return {
      dow,
      trabalha,
      turno_id: null,
      entrada: trabalha ? sugestao.horario.entrada : undefined,
      saida: trabalha ? sugestao.horario.saida : undefined,
      intervalo_minutos: trabalha ? (sugestao.horario.intervalo_minutos ?? 0) : undefined,
    };
  });
}

/**
 * Identidade do horário de um colega, usada só para deduplicar os atalhos
 * "copiar o horário de": compara os horários (base + as variações de
 * entrada/saída/intervalo dos dias trabalhados) e ignora quais dias são folga.
 * Dois colegas com exatamente o mesmo horário aparecem uma única vez, mesmo
 * folgando em dias diferentes. A cópia em si continua trazendo folgas e
 * horários próprios.
 */
export function assinaturaSemana(m: Pick<ModeloHorarioRanking, "horario" | "dias">): string {
  const base = m.horario
    ? `${m.horario.entrada}-${m.horario.saida}-${m.horario.intervalo_minutos ?? 0}`
    : "sem-base";
  const variacoes = [...new Set(
    m.dias
      .filter((d) => d.trabalha && (d.entrada || d.saida))
      .map((d) => `${d.entrada ?? "="}-${d.saida ?? "="}-${d.intervalo_minutos ?? "="}`),
  )].sort().join("|");
  return `${base}#${variacoes}`;
}
