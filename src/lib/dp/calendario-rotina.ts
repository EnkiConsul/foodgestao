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
  atrasado: "outras",
  saida_antecipada: "outras",
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
