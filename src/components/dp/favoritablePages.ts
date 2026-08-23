import type { LucideIcon } from "lucide-react";
import { matchPath } from "react-router-dom";
import {
  Users, Wallet, ClipboardList, FileText, Megaphone, MessageSquare, ShieldAlert,
  Calendar, Repeat, Building2, Briefcase, HandshakeIcon,
  User, ScrollText, FileSignature, History, Upload, Mail,
} from "lucide-react";

/**
 * Uma página do DP que pode ser favoritada.
 * - `pattern`: caminho react-router (pode ter `:param`); usado para reconhecer a rota.
 * - `label` / `labelFor`: nome exibido no atalho — `labelFor` recebe os `params` da rota
 *   e o pathname, permitindo rótulos dinâmicos (ex.: "Folha 03/2026").
 */
export type FavoritablePage = {
  pattern: string;
  icon: LucideIcon;
  label: string;
  labelFor?: (params: Record<string, string | undefined>, pathname: string) => string;
};

/** O que fica resolvido em runtime a partir do pathname atual. */
export type ResolvedFavorite = {
  /** URL exata a persistir e a usar como link do atalho. */
  route: string;
  /** Rótulo já resolvido para exibição. */
  label: string;
  icon: LucideIcon;
  /** Pattern que gerou o match (para lookup reverso). */
  pattern: string;
};

export const FAVORITABLE_PAGES: FavoritablePage[] = [
  // ----- Admin DP -----
  { pattern: "/dp/colaboradores", label: "Colaboradores", icon: Users },
  { pattern: "/dp/folgas", label: "Folgas", icon: Calendar },
  { pattern: "/dp/calendario", label: "Calendário", icon: Calendar },
  { pattern: "/dp/avisos", label: "Avisos", icon: Megaphone },
  { pattern: "/dp/mensagens", label: "Mensagens", icon: MessageSquare },
  { pattern: "/dp/modelos-mensagem", label: "Modelos", icon: Mail },
  { pattern: "/dp/comunicacao", label: "Comunicação", icon: MessageSquare },
  {
    pattern: "/dp/comunicacao/:id",
    label: "Comunicação",
    icon: MessageSquare,
    labelFor: (p) => `Comunicação #${(p.id ?? "").slice(0, 6)}`,
  },
  { pattern: "/dp/disciplinar", label: "Disciplinar", icon: ShieldAlert },
  { pattern: "/dp/documentos", label: "Documentos", icon: FileText },
  
  {
    pattern: "/dp/documentos/:categoria",
    label: "Documentos",
    icon: FileText,
    labelFor: (p) => `Docs — ${capitalize(p.categoria ?? "")}`,
  },
  { pattern: "/dp/cadastros", label: "Cadastros", icon: Building2 },
  { pattern: "/dp/cadastros/unidades", label: "Unidades", icon: Building2 },
  { pattern: "/dp/cadastros/cargos", label: "Cargos e Salários", icon: Briefcase },
  { pattern: "/dp/cadastros/cargos?aba=sindicatos", label: "Sindicatos Laborais", icon: HandshakeIcon },

  // ----- Portal do Colaborador -----
  { pattern: "/dp/meu/perfil", label: "Meu Perfil", icon: User },
  { pattern: "/dp/meu/documentos", label: "Meus Documentos", icon: FileText },
  { pattern: "/dp/meu/solicitacoes", label: "Minhas Solicitações", icon: ClipboardList },
  { pattern: "/dp/meu/trocas", label: "Minhas Trocas", icon: Repeat },
  { pattern: "/dp/meu/calendario", label: "Meu Calendário", icon: Calendar },
  { pattern: "/dp/meu/atestados", label: "Meus Atestados", icon: FileSignature },
  { pattern: "/dp/meu/disciplinar", label: "Meu Disciplinar", icon: ShieldAlert },
  { pattern: "/dp/meu/sindicato", label: "Meu Sindicato", icon: HandshakeIcon },
  { pattern: "/dp/meu/historico", label: "Meu Histórico", icon: History },
  { pattern: "/dp/meu/mural", label: "Mural", icon: Megaphone },
];

function capitalize(s: string) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/**
 * Prioriza patterns mais específicos (mais segmentos e menos placeholders).
 */
function specificity(pattern: string) {
  const segs = pattern.split("/").filter(Boolean);
  const params = segs.filter((s) => s.startsWith(":")).length;
  // mais segmentos + menos params = mais específico
  return segs.length * 10 - params * 5;
}

const SORTED = [...FAVORITABLE_PAGES].sort((a, b) => specificity(b.pattern) - specificity(a.pattern));

/**
 * Dado um pathname atual, retorna a página favoritável correspondente
 * (com label e route já resolvidos). Retorna undefined se a rota não é favoritável.
 */
export function getFavoritablePage(pathname: string): ResolvedFavorite | undefined {
  for (const page of SORTED) {
    const m = matchPath({ path: page.pattern, end: true }, pathname);
    if (m) {
      const params = (m.params ?? {}) as Record<string, string | undefined>;
      const label = page.labelFor ? page.labelFor(params, pathname) : page.label;
      return { route: pathname, label, icon: page.icon, pattern: page.pattern };
    }
  }
  return undefined;
}

/**
 * Resolve uma lista de rotas favoritadas (URLs concretas, potencialmente dinâmicas)
 * de volta a atalhos exibíveis. Rotas que não batem em nenhum pattern são descartadas.
 */
export function resolveFavorites(routes: string[]): ResolvedFavorite[] {
  return routes
    .map((r) => getFavoritablePage(r))
    .filter((x): x is ResolvedFavorite => !!x);
}
