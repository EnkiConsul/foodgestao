import type { DpNavGroup, DpNavItem, DpNavSurface } from "@/config/dpNavigation";

/** Ordem persistida do menu (overlay sobre o menu de fábrica). */
export type DpMenuLayout = {
  v: 1;
  /** Ids de grupos na ordem escolhida. */
  groups: string[];
  /** Ordem dos itens (rotas) por id de grupo. */
  items: Record<string, string[]>;
};

export type DpMenuSurfaceKey = "dp" | "portal";

export const EMPTY_LAYOUT: DpMenuLayout = { v: 1, groups: [], items: {} };

/** Ordena por uma lista de chaves; o que não estiver na lista vai para o fim. */
function orderBy<T>(list: T[], keyOf: (v: T) => string, order: string[]): T[] {
  const index = new Map(order.map((k, i) => [k, i]));
  return [...list].sort((a, b) => {
    const ia = index.has(keyOf(a)) ? index.get(keyOf(a))! : Number.MAX_SAFE_INTEGER;
    const ib = index.has(keyOf(b)) ? index.get(keyOf(b))! : Number.MAX_SAFE_INTEGER;
    if (ia !== ib) return ia - ib;
    return list.indexOf(a) - list.indexOf(b);
  });
}

/** Aplica a ordem salva sobre o menu de fábrica, preservando itens novos. */
export function applyMenuLayout(
  surface: DpNavSurface,
  layout?: DpMenuLayout | null,
): DpNavSurface {
  if (!layout || !isValidLayout(layout)) return surface;
  const groups: DpNavGroup[] = orderBy(surface.groups, (g) => g.id, layout.groups).map(
    (g) => {
      const order = layout.items[g.id];
      if (!Array.isArray(order) || order.length === 0) return g;
      return { ...g, items: orderBy(g.items, (i: DpNavItem) => i.to, order) };
    },
  );
  return { ...surface, groups };
}

/** Extrai a ordem atual de uma superfície (usada para inicializar o editor). */
export function extractLayout(surface: DpNavSurface): DpMenuLayout {
  return {
    v: 1,
    groups: surface.groups.map((g) => g.id),
    items: Object.fromEntries(
      surface.groups.map((g) => [g.id, g.items.map((i) => i.to)]),
    ),
  };
}

export function isValidLayout(value: unknown): value is DpMenuLayout {
  if (!value || typeof value !== "object") return false;
  const l = value as Partial<DpMenuLayout>;
  if (l.v !== 1) return false;
  if (!Array.isArray(l.groups) || !l.groups.every((g) => typeof g === "string")) return false;
  if (!l.items || typeof l.items !== "object") return false;
  return Object.values(l.items).every(
    (arr) => Array.isArray(arr) && arr.every((v) => typeof v === "string"),
  );
}

/** Remove grupos/rotas que não existem mais no menu de fábrica. */
export function sanitizeLayout(
  surface: DpNavSurface,
  layout: DpMenuLayout,
): DpMenuLayout {
  const validGroups = new Set(surface.groups.map((g) => g.id));
  const routesByGroup = new Map(
    surface.groups.map((g) => [g.id, new Set(g.items.map((i) => i.to))]),
  );
  return {
    v: 1,
    groups: layout.groups.filter((g) => validGroups.has(g)),
    items: Object.fromEntries(
      Object.entries(layout.items)
        .filter(([g]) => validGroups.has(g))
        .map(([g, routes]) => [
          g,
          routes.filter((r) => routesByGroup.get(g)?.has(r)),
        ]),
    ),
  };
}

/** Reordena subgrupos do menu mobile ("Mais") conforme a ordem salva. */
export function orderSubgroupsByLayout<T extends { id?: string }>(
  subgroups: T[],
  layout?: DpMenuLayout | null,
): T[] {
  if (!layout || !isValidLayout(layout) || layout.groups.length === 0) return subgroups;
  return orderBy(subgroups, (s) => s.id ?? "", layout.groups);
}

/** Reordena itens de um subgrupo conforme a ordem salva. */
export function orderLeavesByLayout<T extends { to: string }>(
  groupId: string | undefined,
  leaves: T[],
  layout?: DpMenuLayout | null,
): T[] {
  if (!groupId || !layout || !isValidLayout(layout)) return leaves;
  const order = layout.items[groupId];
  if (!Array.isArray(order) || order.length === 0) return leaves;
  return orderBy(leaves, (l) => l.to, order);
}
