// Calendário unificado da Rotina: classifica as ausências de cada dia por
// tipo e aplica os filtros de visibilidade escolhidos pelo gestor.
import type { CategoriaDia, PessoaPanorama } from "@/lib/dp/operacao-panorama";

export type TipoAusenciaCalendario = "folga" | "ferias" | "falta" | "atestado" | "outras";

export const TIPOS_AUSENCIA: TipoAusenciaCalendario[] = ["folga", "ferias", "falta", "atestado", "outras"];

export const TIPO_AUSENCIA_LABEL: Record<TipoAusenciaCalendario, string> = {
  folga: "Folgas",
  ferias: "Férias",
  falta: "Faltas",
  atestado: "Atestados / Licenças",
  outras: "Demais ausências",
};

const MAPA: Partial<Record<CategoriaDia, TipoAusenciaCalendario>> = {
  folga_padrao: "folga",
  folga_extra: "folga",
  ferias: "ferias",
  ausente: "falta",
  atestado: "atestado",
  coberto: "outras",
  // Atraso e saída antecipada não são ausência: a pessoa trabalhou.
};

export function tipoAusencia(categoria: CategoriaDia): TipoAusenciaCalendario | null {
  return MAPA[categoria] ?? null;
}

export interface AusenciaCalendario {
  colaborador_id: string;
  nome: string;
  tipo: TipoAusenciaCalendario;
}

/** Ausências do dia visíveis com os filtros ativos, ordenadas por tipo e nome. */
export function ausenciasVisiveis(
  pessoas: Pick<PessoaPanorama, "colaborador_id" | "nome" | "categoria">[],
  ativos: TipoAusenciaCalendario[],
): AusenciaCalendario[] {
  const set = new Set(ativos);
  const vistos = new Set<string>();
  const out: AusenciaCalendario[] = [];
  for (const p of pessoas) {
    const tipo = tipoAusencia(p.categoria);
    if (!tipo || !set.has(tipo)) continue;
    const k = `${p.colaborador_id}:${tipo}`;
    if (vistos.has(k)) continue;
    vistos.add(k);
    out.push({ colaborador_id: p.colaborador_id, nome: p.nome, tipo });
  }
  return out.sort(
    (a, b) => TIPOS_AUSENCIA.indexOf(a.tipo) - TIPOS_AUSENCIA.indexOf(b.tipo) || a.nome.localeCompare(b.nome, "pt-BR"),
  );
}

/** Lê os filtros salvos; sem preferência válida, todos ficam marcados. */
export function filtrosSalvos(valor: unknown): TipoAusenciaCalendario[] {
  if (!Array.isArray(valor)) return [...TIPOS_AUSENCIA];
  return TIPOS_AUSENCIA.filter((t) => valor.includes(t));
}

export const primeiroNome = (nome: string) => nome.trim().split(/\s+/)[0] ?? nome;

export type PeriodoTurno = "todos" | "dia" | "noite";

/** Turno que começa a partir das 15h é da noite; antes disso, do dia. */
export function periodoDoHorario(entrada: string | null | undefined): Exclude<PeriodoTurno, "todos"> | null {
  if (!entrada) return null;
  const h = Number(entrada.slice(0, 2));
  if (Number.isNaN(h)) return null;
  return h >= 15 ? "noite" : "dia";
}

export interface FiltrosPessoaCalendario {
  periodo: PeriodoTurno;
  setores: string[]; // vazio = todos
}

/** Pessoa sem horário conhecido (ex.: férias) continua aparecendo em qualquer turno. */
export function pessoaNoFiltro(
  p: Pick<PessoaPanorama, "entrada" | "setor_id"> & { colaborador_id?: string },
  f: FiltrosPessoaCalendario,
  habitual?: Map<string, Exclude<PeriodoTurno, "todos">>,
): boolean {
  if (f.periodo !== "todos") {
    const per = periodoDoHorario(p.entrada) ?? (p.colaborador_id ? habitual?.get(p.colaborador_id) : undefined) ?? null;
    if (per && per !== f.periodo) return false;
  }
  if (f.setores.length && !f.setores.includes(p.setor_id ?? "")) return false;
  return true;
}

/**
 * Turno habitual de cada pessoa no período: o mais frequente nos dias em que
 * ela tem horário. Usado para encaixar folgas/férias (sem horário) no turno certo.
 */
export function periodoHabitual(
  dias: { pessoas: Pick<PessoaPanorama, "colaborador_id" | "entrada">[] }[],
): Map<string, Exclude<PeriodoTurno, "todos">> {
  const cont = new Map<string, { dia: number; noite: number }>();
  for (const d of dias) for (const p of d.pessoas) {
    const per = periodoDoHorario(p.entrada);
    if (!per) continue;
    const c = cont.get(p.colaborador_id) ?? { dia: 0, noite: 0 };
    c[per]++;
    cont.set(p.colaborador_id, c);
  }
  const out = new Map<string, Exclude<PeriodoTurno, "todos">>();
  for (const [id, c] of cont) out.set(id, c.noite > c.dia ? "noite" : "dia");
  return out;
}
