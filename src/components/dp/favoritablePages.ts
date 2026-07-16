import type { LucideIcon } from "lucide-react";
import {
  Users, Wallet, ClipboardList, FileText, Megaphone, MessageSquare, ShieldAlert,
  Calendar, Repeat, CheckSquare, Building2, Briefcase, HandshakeIcon, Ban,
  User, Cake, ScrollText, FileSignature, History, Upload, Mail,
} from "lucide-react";

export type FavoritablePage = { route: string; label: string; icon: LucideIcon };

/**
 * Registro central de páginas do DP que podem ser favoritadas.
 * Rotas exatas — comparação usa startsWith apenas quando indicado.
 */
export const FAVORITABLE_PAGES: FavoritablePage[] = [
  // ----- Admin DP -----
  { route: "/dp/colaboradores", label: "Colaboradores", icon: Users },
  { route: "/dp/folgas", label: "Folgas", icon: Calendar },
  { route: "/dp/calendario", label: "Calendário", icon: Calendar },
  { route: "/dp/trocas", label: "Trocas", icon: Repeat },
  { route: "/dp/solicitacoes", label: "Solicitações", icon: ClipboardList },
  { route: "/dp/aprovacoes", label: "Aprovações", icon: CheckSquare },
  { route: "/dp/avisos", label: "Avisos", icon: Megaphone },
  { route: "/dp/mensagens", label: "Mensagens", icon: MessageSquare },
  { route: "/dp/modelos-mensagem", label: "Modelos", icon: Mail },
  { route: "/dp/comunicacao", label: "Comunicação", icon: MessageSquare },
  { route: "/dp/disciplinar", label: "Disciplinar", icon: ShieldAlert },
  { route: "/dp/bloqueios", label: "Bloqueios", icon: Ban },
  { route: "/dp/documentos", label: "Documentos", icon: FileText },
  { route: "/dp/documentos/importar", label: "Importar docs", icon: Upload },
  { route: "/dp/folha", label: "Folha", icon: Wallet },
  { route: "/dp/folha/aprovacoes", label: "Folha - Aprovações", icon: CheckSquare },
  { route: "/dp/cadastros", label: "Cadastros", icon: Building2 },
  { route: "/dp/cadastros/unidades", label: "Unidades", icon: Building2 },
  { route: "/dp/cadastros/cargos", label: "Cargos", icon: Briefcase },
  { route: "/dp/cadastros/sindicatos", label: "Sindicatos", icon: HandshakeIcon },
  { route: "/dp/sindicatos/negociacoes", label: "Negociações", icon: FileSignature },

  // ----- Portal do Colaborador -----
  { route: "/dp/meu/perfil", label: "Meu Perfil", icon: User },
  { route: "/dp/meu/documentos", label: "Meus Documentos", icon: FileText },
  { route: "/dp/meu/solicitacoes", label: "Minhas Solicitações", icon: ClipboardList },
  { route: "/dp/meu/trocas", label: "Minhas Trocas", icon: Repeat },
  { route: "/dp/meu/calendario", label: "Meu Calendário", icon: Calendar },
  { route: "/dp/meu/atestados", label: "Meus Atestados", icon: FileSignature },
  { route: "/dp/meu/disciplinar", label: "Meu Disciplinar", icon: ShieldAlert },
  { route: "/dp/meu/sindicato", label: "Meu Sindicato", icon: HandshakeIcon },
  { route: "/dp/meu/historico", label: "Meu Histórico", icon: History },
];

const BY_ROUTE = new Map(FAVORITABLE_PAGES.map((p) => [p.route, p]));

export function getFavoritablePage(route: string): FavoritablePage | undefined {
  // match exato primeiro
  if (BY_ROUTE.has(route)) return BY_ROUTE.get(route);
  // fallback: match do prefixo mais longo (ex.: /dp/documentos/:categoria → /dp/documentos)
  const sorted = [...FAVORITABLE_PAGES].sort((a, b) => b.route.length - a.route.length);
  return sorted.find((p) => route === p.route || route.startsWith(p.route + "/"));
}

export function resolveFavorites(routes: string[]): FavoritablePage[] {
  return routes.map((r) => BY_ROUTE.get(r)).filter(Boolean) as FavoritablePage[];
}
