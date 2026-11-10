/**
 * Enquadramento do Pessoas 360° pela equipe: no fim do teste grátis (ou ao abrir
 * os planos sem plano escolhido) a tela já marca o menor plano que comporta os
 * colaboradores ativos e as unidades da empresa. Os limites vêm do catálogo
 * (`plans.features`), nunca de números fixos na tela; o valor segue no servidor.
 *
 * Enterprise (cobrado por colaborador ativo): só é contratado direto quando a
 * empresa tem pelo menos o mínimo do catálogo (`min_collaborators`) de
 * colaboradores ativos. Abaixo disso — inclusive redes pequenas com mais
 * unidades do que os planos com franquia comportam — fica "sob consulta".
 * O servidor (`billing_v2_quote`) repete a mesma trava.
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
  /** Decisão do servidor (`billing_v2_enterprise_elegibilidade`); quando ausente, compara com o mínimo do catálogo. */
  enterpriseLiberado?: boolean | null;
}

function limite(features: PlanoCatalogo["features"], chave: string): number | null {
  const v = Number((features ?? {})[chave]);
  return Number.isFinite(v) && v >= 0 && (features ?? {})[chave] !== null && (features ?? {})[chave] !== "" ? v : null;
}

/** Plano por colaborador ativo (Enterprise): sem franquia, cobra cada colaborador. */
export function planoPorColaborador(p: Pick<PlanoCatalogo, "features"> | null | undefined): boolean {
  return (limite(p?.features, "price_per_collaborator_cents") ?? 0) > 0;
}

/** Mínimo de colaboradores ativos para contratar direto o plano por colaborador. */
export function minimoEnterprise(p: Pick<PlanoCatalogo, "features"> | null | undefined): number {
  return Math.max(1, Math.floor(limite(p?.features, "min_collaborators") ?? 1));
}

/** O plano por colaborador pode ser contratado direto por esta equipe? Planos com franquia: sempre. */
export function enterpriseLiberado(p: Pick<PlanoCatalogo, "features">, equipe: EquipeEmpresa): boolean {
  if (!planoPorColaborador(p)) return true;
  if (typeof equipe.enterpriseLiberado === "boolean") return equipe.enterpriseLiberado;
  return Math.max(0, equipe.colaboradores) >= minimoEnterprise(p);
}

/** O plano comporta a equipe (colaboradores e unidades) sem excedente? */
export function planoComportaEquipe(p: PlanoCatalogo, equipe: EquipeEmpresa): boolean {
  if (planoPorColaborador(p)) return enterpriseLiberado(p, equipe);
  const maxColab = limite(p.features, "max_collaborators");
  const maxUnid = limite(p.features, "max_units");
  if (maxColab !== null && Math.max(0, equipe.colaboradores) > maxColab) return false;
  if (maxUnid !== null && Math.max(0, equipe.unidades ?? 0) > maxUnid) return false;
  return true;
}

function elegiveisPessoas(planos: PlanoCatalogo[]): PlanoCatalogo[] {
  return planos
    .filter((p) => (p.module ?? "pessoas") === "pessoas" && !p.is_enterprise)
    .sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0));
}

export type Enquadramento =
  | { tipo: "plano"; plano: PlanoCatalogo }
  | { tipo: "sob_consulta"; motivo: string };

/**
 * Enquadra a equipe: menor plano com franquia que comporta; senão o Enterprise
 * (se liberado); senão "sob consulta" com o motivo para o atendimento comercial.
 */
export function enquadrarPlanoPessoas(planos: PlanoCatalogo[], equipe: EquipeEmpresa): Enquadramento | null {
  const elegiveis = elegiveisPessoas(planos);
  if (!elegiveis.length) return null;
  const comFranquia = elegiveis.find((p) => !planoPorColaborador(p) && planoComportaEquipe(p, equipe));
  if (comFranquia) return { tipo: "plano", plano: comFranquia };
  const ent = elegiveis.find(planoPorColaborador);
  if (ent && enterpriseLiberado(ent, equipe)) return { tipo: "plano", plano: ent };
  const unidades = Math.max(0, equipe.unidades ?? 0);
  const maiorUnid = Math.max(0, ...elegiveis.filter((p) => !planoPorColaborador(p)).map((p) => limite(p.features, "max_units") ?? 0));
  return {
    tipo: "sob_consulta",
    motivo: unidades > maiorUnid && maiorUnid > 0
      ? `Sua empresa tem ${unidades} unidades ativas e os planos com contratação direta incluem até ${maiorUnid}. Para redes com mais unidades e equipe menor, preparamos uma proposta sob medida.`
      : "Para a sua equipe, preparamos uma proposta sob medida.",
  };
}

/** Plano sugerido para a equipe; null quando o caso é "sob consulta". */
export function sugerirPlanoPessoas(planos: PlanoCatalogo[], equipe: EquipeEmpresa): PlanoCatalogo | null {
  const e = enquadrarPlanoPessoas(planos, equipe);
  return e?.tipo === "plano" ? e.plano : null;
}

/** Orientação quando o plano escolhido não comporta a equipe atual; null se comporta. */
export function avisoPlanoAbaixoDaEquipe(p: PlanoCatalogo, equipe: EquipeEmpresa): string | null {
  if (planoComportaEquipe(p, equipe)) return null;
  if (planoPorColaborador(p)) {
    return `O ${p.name} é contratado direto a partir de ${minimoEnterprise(p)} colaboradores ativos. Para a sua equipe, fale com nosso especialista.`;
  }
  const maxColab = limite(p.features, "max_collaborators");
  const maxUnid = limite(p.features, "max_units");
  if (maxColab !== null && equipe.colaboradores > maxColab) {
    return `Sua empresa tem ${equipe.colaboradores} colaboradores ativos; o ${p.name} inclui até ${maxColab}.`;
  }
  return `Sua empresa tem ${equipe.unidades ?? 0} unidades ativas; o ${p.name} inclui até ${maxUnid}.`;
}
