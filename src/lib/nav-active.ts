/**
 * Resolução de item ativo por especificidade.
 *
 * Regra: entre todas as rotas de um menu, apenas a correspondência mais
 * específica (prefixo mais longo) fica ativa. Isso evita que `/dp/ponto`
 * apareça ativo quando o usuário está em `/dp/ponto/time`.
 */

/** Retorna a rota mais específica que corresponde ao pathname, ou null. */
export function resolveActiveRoute(
  pathname: string,
  routes: readonly string[],
): string | null {
  let best: string | null = null;
  for (const route of routes) {
    const normalized = route.endsWith("/") ? route.slice(0, -1) : route;
    const matches =
      pathname === normalized || pathname.startsWith(normalized + "/");
    if (!matches) continue;
    if (best === null || normalized.length > best.length) best = normalized;
  }
  return best;
}

/** Cria um predicado `isActive(to)` com precedência de maior especificidade. */
export function makeIsActive(
  pathname: string,
  routes: readonly string[],
): (to: string) => boolean {
  const active = resolveActiveRoute(pathname, routes);
  return (to: string) => active !== null && active === to;
}
