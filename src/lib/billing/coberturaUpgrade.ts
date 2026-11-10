import { formatCents, precoPorColaborador } from "@/lib/billing";

export type SugestaoUpgrade = {
  plano: string;
  nome: string;
  preco_mensal_cents: number | null;
  enterprise: boolean;
};

export type PlanoCatalogo = {
  slug: string;
  is_enterprise: boolean | null;
  price_monthly_cents: number | null;
  features: unknown;
};

export type OpcaoUpgrade =
  | { tipo: "direto"; texto: string }
  | { tipo: "especialista"; texto: string };

/**
 * Decide como oferecer a sugestão de upgrade. O catálogo é a fonte de verdade:
 * plano marcado como "sob consulta" (is_enterprise) vai para o especialista; os demais,
 * inclusive o Enterprise por colaborador ativo, são contratados direto pelo sistema.
 */
export function resolverOpcaoUpgrade(up: SugestaoUpgrade, catalogo: PlanoCatalogo | null | undefined): OpcaoUpgrade {
  if (catalogo && !catalogo.is_enterprise) {
    const porColab = precoPorColaborador(catalogo.features);
    if (porColab) {
      return {
        tipo: "direto",
        texto: `${formatCents(porColab.unitarioCents)} por colaborador ativo/mês · base de ${porColab.minimo} colaboradores (${formatCents(porColab.baseCents)}/mês), sem limite de colaboradores`,
      };
    }
    return { tipo: "direto", texto: `${formatCents(catalogo.price_monthly_cents ?? up.preco_mensal_cents)}/mês` };
  }
  if (!catalogo && !up.enterprise && up.preco_mensal_cents != null) {
    return { tipo: "direto", texto: `${formatCents(up.preco_mensal_cents)}/mês` };
  }
  return { tipo: "especialista", texto: "Fale com nosso especialista." };
}
