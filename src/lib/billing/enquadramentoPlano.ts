/**
 * Enquadramento do Pessoas 360° pela equipe: no fim do teste grátis (ou ao abrir
 * os planos sem plano escolhido) a tela já marca o menor plano que comporta os
 * colaboradores ativos e as unidades da empresa. Os limites vêm do catálogo
 * (`plans.features`), nunca de números fixos na tela; o valor segue no servidor.
 */

export interface PlanoCatalogo {
  slug: string;
  name: string;
  module?: string | null;
  sort_order?: number | null;
  is_enterprise?: boolean | null;
  features?: Record<string, unknown> | null;
}

export interface EquipeEmpresa {
  colaboradores: number;
  unidades?: number | null;
}

function limite(features: PlanoCatalogo["features"], chave: string): number | null {
  const v = Number((features ?? {})[chave]);
  return Number.isFinite(v) && v >= 0 && (features ?? {})[chave] !== null && (features ?? {})[chave] !== "" ? v : null;
}

/** Plano por colaborador ativo (Enterprise): sem franquia, cobra cada colaborador. */
function porColaborador(p: PlanoCatalogo): boolean {
  return (limite(p.features, "price_per_collaborator_cents") ?? 0) > 0;
}

/** O plano comporta a equipe (colaboradores e unidades) sem excedente? */
export function planoComportaEquipe(p: PlanoCatalogo, equipe: EquipeEmpresa): boolean {
  if (porColaborador(p)) return true;
  const maxColab = limite(p.features, "max_collaborators");
  const maxUnid = limite(p.features, "max_units");
  if (maxColab !== null && Math.max(0, equipe.colaboradores) > maxColab) return false;
  if (maxUnid !== null && Math.max(0, equipe.unidades ?? 0) > maxUnid) return false;
  return true;
}

/**
 * Menor plano contratável pelo checkout que comporta a equipe.
 * Planos só de contato com especialista (`is_enterprise`) ficam de fora.
 */
export function sugerirPlanoPessoas(planos: PlanoCatalogo[], equipe: EquipeEmpresa): PlanoCatalogo | null {
  const elegiveis = planos
    .filter((p) => (p.module ?? "pessoas") === "pessoas" && !p.is_enterprise)
    .sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0));
  const comFranquia = elegiveis.find((p) => !porColaborador(p) && planoComportaEquipe(p, equipe));
  return comFranquia ?? elegiveis.find(porColaborador) ?? elegiveis[elegiveis.length - 1] ?? null;
}

/** Orientação quando o plano escolhido não comporta a equipe atual; null se comporta. */
export function avisoPlanoAbaixoDaEquipe(p: PlanoCatalogo, equipe: EquipeEmpresa): string | null {
  if (planoComportaEquipe(p, equipe)) return null;
  const maxColab = limite(p.features, "max_collaborators");
  const maxUnid = limite(p.features, "max_units");
  if (maxColab !== null && equipe.colaboradores > maxColab) {
    return `Sua empresa tem ${equipe.colaboradores} colaboradores ativos; o ${p.name} inclui até ${maxColab}.`;
  }
  return `Sua empresa tem ${equipe.unidades ?? 0} unidades ativas; o ${p.name} inclui até ${maxUnid}.`;
}
