import type { ActiveModule } from "@/hooks/useActiveModule";

/**
 * Destino do arrasto da borda esquerda para a direita.
 *
 * Regra pedida: dentro do módulo Pessoas 360°, estando na tela inicial, o gesto
 * abre o Hub de módulos (quando a empresa tem mais de um módulo ativo) ou o
 * Analytics de Pessoas. Em qualquer outra situação, o gesto continua voltando.
 */
export type DestinoGestoEsquerda = { tipo: "voltar" } | { tipo: "navegar"; to: string };

export const HUB_ROUTE = "/hub";
export const DP_ANALYTICS_ROUTE = "/dp/analytics";

export function destinoGestoEsquerda(args: {
  activeModule: ActiveModule;
  pathname: string;
  homeTo: string;
  /** Quantidade de módulos ativos/contratados da empresa. */
  modulosAtivos: number;
}): DestinoGestoEsquerda {
  const { activeModule, pathname, homeTo, modulosAtivos } = args;
  if (activeModule !== "dp") return { tipo: "voltar" };
  if (pathname !== homeTo) return { tipo: "voltar" };
  return { tipo: "navegar", to: modulosAtivos > 1 ? HUB_ROUTE : DP_ANALYTICS_ROUTE };
}
