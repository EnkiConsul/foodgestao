import type { ActiveModule } from "@/hooks/useActiveModule";

/**
 * Destino do arrasto da borda esquerda para a direita.
 *
 * Regras:
 * - Na tela "Mais" do módulo, o gesto volta para a tela anterior.
 * - Na tela inicial de Pessoas 360°, abre o Hub de módulos (quando a empresa
 *   tem mais de um módulo ativo) ou o Analytics de Pessoas.
 * - Em qualquer outra situação, o gesto continua voltando.
 */
export type DestinoGestoEsquerda = { tipo: "voltar" } | { tipo: "navegar"; to: string };

export const HUB_ROUTE = "/hub";
export const DP_ANALYTICS_ROUTE = "/dp/analytics";

export function destinoGestoEsquerda(args: {
  activeModule: ActiveModule;
  pathname: string;
  homeTo: string;
  /** Rota da tela "Mais" do módulo ativo. */
  moreTo?: string;
  /** Quantidade de módulos ativos/contratados da empresa. */
  modulosAtivos: number;
}): DestinoGestoEsquerda {
  const { activeModule, pathname, homeTo, moreTo, modulosAtivos } = args;
  if (moreTo && pathname === moreTo) return { tipo: "voltar" };
  if (activeModule !== "dp") return { tipo: "voltar" };
  if (pathname !== homeTo) return { tipo: "voltar" };
  return { tipo: "navegar", to: modulosAtivos > 1 ? HUB_ROUTE : DP_ANALYTICS_ROUTE };
}
