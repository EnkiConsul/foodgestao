/**
 * Telas de navegação (hubs de menu) onde o arrasto de cima para baixo serve
 * para voltar ao menu anterior — e por isso não dispara o "atualizar".
 * No Início e nas telas de uso o pull-to-refresh continua ativo.
 */
export const ROTAS_HUB_MENU = [
  "/dp/cadastros",
  "/dp/documentos/inicio",
  "/dp/rotina",
  "/dp/comunicacao",
  "/dp/geral",
];

export function permitePullToRefresh(pathname: string): boolean {
  return !ROTAS_HUB_MENU.some((r) => pathname === r || pathname.startsWith(`${r}/`));
}
