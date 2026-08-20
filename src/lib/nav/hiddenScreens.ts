import type { DpNavGroup, DpNavSurface } from "@/config/dpNavigation";

/**
 * Config global de telas "em desenvolvimento" (super admin).
 * `enabled = false` reexibe tudo sem perder as marcações.
 */
export type HiddenScreensConfig = {
  enabled: boolean;
  routes: string[];
};

export const EMPTY_HIDDEN: HiddenScreensConfig = { enabled: false, routes: [] };

/** Conjunto efetivo de rotas ocultas (vazio quando o interruptor está desligado). */
export function effectiveHiddenRoutes(config: HiddenScreensConfig | null | undefined): Set<string> {
  if (!config?.enabled) return new Set();
  return new Set(config.routes ?? []);
}

/** A rota atual está oculta? Casa rota exata e rotas filhas (`/dp/folha/:id`). */
export function isRouteHidden(pathname: string, hidden: Set<string>): boolean {
  if (hidden.size === 0) return false;
  for (const route of hidden) {
    if (pathname === route || pathname.startsWith(route + "/")) return true;
  }
  return false;
}

function itemHidden(to: string, hidden: Set<string>): boolean {
  return hidden.has(to);
}

/** Remove itens ocultos e grupos que ficaram vazios. */
export function filterSurface(surface: DpNavSurface, hidden: Set<string>): DpNavSurface {
  if (hidden.size === 0) return surface;
  const groups: DpNavGroup[] = surface.groups
    .map((g) => ({ ...g, items: g.items.filter((i) => !itemHidden(i.to, hidden)) }))
    .filter((g) => g.items.length > 0);
  return {
    ...surface,
    direct: surface.direct.filter((i) => !itemHidden(i.to, hidden)),
    groups,
    extraShortcuts: surface.extraShortcuts.filter((i) => !itemHidden(i.to, hidden)),
  };
}

type LeafLike = { to: string };
type MoreGroupLike = {
  items?: LeafLike[];
  subgroups?: { items: LeafLike[] }[];
};

/**
 * Versão para a navegação mobile (`MoreGroup`): tira itens ocultos,
 * subgrupos vazios e grupos que ficaram sem nada.
 */
export function filterMoreGroups<T extends MoreGroupLike>(groups: T[], hidden: Set<string>): T[] {
  if (hidden.size === 0) return groups;
  return groups
    .map((g) => ({
      ...g,
      items: g.items?.filter((i) => !itemHidden(i.to, hidden)),
      subgroups: g.subgroups
        ?.map((sg) => ({ ...sg, items: sg.items.filter((i) => !itemHidden(i.to, hidden)) }))
        .filter((sg) => sg.items.length > 0),
    }))
    .filter((g) => (g.items?.length ?? 0) > 0 || (g.subgroups?.length ?? 0) > 0) as T[];
}

/** Remove atalhos/opções cujo destino está oculto. */
export function filterLeaves<T extends LeafLike>(leaves: T[], hidden: Set<string>): T[] {
  if (hidden.size === 0) return leaves;
  return leaves.filter((l) => !itemHidden(l.to, hidden));
}
