import {
  ArrowLeftRight,
  Ban,
  BarChart3,
  Bell,
  BellRing,
  Briefcase,
  Building2,
  Calculator,
  Calendar,
  CalendarClock,
  CalendarRange,
  ClipboardList,
  Clock,
  Coins,
  FileBarChart,
  FileSignature,
  FileText,
  Fingerprint,
  FolderOpen,
  Gift,
  HeartPulse,
  Home,
  LayoutTemplate,
  ListChecks,
  Megaphone,
  MessageSquare,
  Palmtree,
  Receipt,
  Repeat,
  Scale,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Upload,
  User,
  UserCheck,
  Users,
  Wand2,
  type LucideIcon,
} from "lucide-react";


/**
 * ─────────────────────────────────────────────────────────────────────────
 * FONTE ÚNICA DA NAVEGAÇÃO DO Pessoas 360° E DO PORTAL DO COLABORADOR.
 *
 * `src/config/mobileNav.tsx` (menu "Mais" mobile) e
 * `src/components/dp/DpSidebar.tsx` (sidebar desktop) derivam suas listas
 * daqui — desktop e mobile contam sempre a mesma história.
 *
 * Rotas internas (detalhe/edição/redirect) NÃO entram aqui de propósito:
 * ex.: /dp/folha/:id, /dp/documentos/:categoria, /dp/mais, redirects legados.
 * ─────────────────────────────────────────────────────────────────────────
 */

export type DpNavItem = {
  label: string;
  to: string;
  icon: LucideIcon;
  /** Link raiz que possui rotas filhas — exige correspondência exata. */
  end?: boolean;
  /** Item oferecido como opção de atalho na BottomNav mobile. */
  shortcut?: boolean;
  /** Rótulo curto usado nos atalhos da BottomNav (default: label). */
  shortLabel?: string;
  /** Selo discreto ao lado do rótulo (ex.: "Em breve"). */
  badge?: string;
};


export type DpNavGroup = {
  /** Slug estável (independente do rótulo) usado para persistir a ordem. */
  id: string;
  label: string;
  icon: LucideIcon;
  /** Rota "hub" da seção — cabeçalho do grupo navega para cá. */
  hubTo?: string;
  /** Prefixos que abrem o grupo automaticamente (não definem item ativo). */
  matchPrefixes: string[];
  items: DpNavItem[];
};

export type DpNavSurface = {
  home: DpNavItem;
  /** Itens diretos (fora de grupos). */
  direct: DpNavItem[];
  groups: DpNavGroup[];
  /** Atalhos extras que não aparecem no menu (hubs), preservam defaults. */
  extraShortcuts: DpNavItem[];
};

// ── Pessoas 360° (admin) ──────────────────────────────────────────────────────

const ADMIN_GROUPS: DpNavGroup[] = [
  {
    id: "rotina-dia",
    label: "Rotina do Dia",
    icon: CalendarClock,
    hubTo: "/dp/operacao",
    matchPrefixes: [
      "/dp/operacao",
      "/dp/escalas",
      "/dp/convocacoes",
      "/dp/folgas/calendario",
    ],
    items: [
      { label: "Operação do Dia", to: "/dp/operacao", icon: CalendarClock, shortcut: true },
      { label: "Escala do Mês", to: "/dp/escalas/mes", icon: CalendarRange, shortcut: true },
      { label: "Gerar Escala", to: "/dp/escalas", icon: Wand2, end: true, shortcut: true },
      { label: "Convocações", to: "/dp/convocacoes", icon: BellRing },
      { label: "Calendário Geral", to: "/dp/folgas/calendario", icon: Calendar },
    ],
  },
  {
    id: "folgas-ferias",
    label: "Folgas e Férias",
    icon: Calendar,
    matchPrefixes: [
      "/dp/solicitacoes",
      "/dp/aprovacoes",
      "/dp/trocas",
      "/dp/ferias",
      "/dp/bloqueios",
      "/dp/folgas/configuracoes",
      "/dp/conformidade-dsr",
    ],
    items: [
      { label: "Solicitações", to: "/dp/solicitacoes", icon: ClipboardList, shortcut: true },
      { label: "Aprovações", to: "/dp/aprovacoes", icon: UserCheck, shortcut: true },
      { label: "Trocas", to: "/dp/trocas", icon: ArrowLeftRight },
      { label: "Férias", to: "/dp/ferias", icon: Palmtree, shortcut: true },
      { label: "Datas Bloqueadas", to: "/dp/bloqueios", icon: Ban },
      { label: "Regras de Folgas", to: "/dp/folgas/configuracoes/regras", icon: Settings },
      { label: "Conformidade DSR", to: "/dp/conformidade-dsr", icon: Scale },
    ],
  },



  {
    id: "documentos",
    label: "Documentos",
    icon: FileText,
    hubTo: "/dp/documentos",
    matchPrefixes: ["/dp/documentos", "/dp/disciplinar", "/dp/atestados"],
    items: [
      { label: "Importar", to: "/dp/documentos", icon: Upload, end: true, shortcut: true, shortLabel: "Importar" },

      {
        label: "Histórico",
        to: "/dp/documentos/historico",
        icon: ListChecks,
        shortcut: true,
        shortLabel: "Histórico",
      },
      { label: "Atestados", to: "/dp/atestados", icon: HeartPulse },
      { label: "Disciplinares", to: "/dp/disciplinar", icon: ShieldAlert },

    ],
  },
  {
    id: "comunicacao",
    label: "Comunicação",
    icon: MessageSquare,
    hubTo: "/dp/comunicacao",
    matchPrefixes: [
      "/dp/comunicacao",
      "/dp/mensagens",
      "/dp/modelos-mensagem",
      "/dp/avisos",
      "/dp/notificacoes",
    ],
    items: [
      { label: "Mensagens", to: "/dp/mensagens", icon: MessageSquare },
      { label: "Modelos de Mensagem", to: "/dp/modelos-mensagem", icon: LayoutTemplate },
      { label: "Quadro de Avisos", to: "/dp/avisos", icon: Bell },
      { label: "Notificações", to: "/dp/notificacoes", icon: BellRing },
    ],
  },
  {
    id: "cadastro",
    label: "Cadastro",
    icon: Users,
    hubTo: "/dp/cadastros",
    matchPrefixes: ["/dp/colaboradores", "/dp/cadastros"],
    items: [
      { label: "Colaboradores", to: "/dp/colaboradores", icon: Users, shortcut: true },
      { label: "Cargos e Salários", to: "/dp/cadastros/cargos", icon: Briefcase },
      { label: "Unidades", to: "/dp/cadastros/unidades", icon: Building2 },
      { label: "Benefícios", to: "/dp/cadastros/beneficios", icon: Gift },
      { label: "Pendências", to: "/dp/cadastros/pendencias", icon: BellRing },
    ],
  },
];

const ADMIN_DIRECT: DpNavItem[] = [
  { label: "SESMT", to: "/dp/conformidade", icon: ShieldCheck, end: true, badge: "Em breve" },
  { label: "Analytics de RH", to: "/dp/analytics", icon: BarChart3, shortcut: true, shortLabel: "Analytics" },
  { label: "Configurações de Pessoas", to: "/dp/configuracoes", icon: Settings },
];

export const DP_ADMIN_NAV: DpNavSurface = {
  home: { label: "Início", to: "/dp", icon: Home, end: true },
  direct: ADMIN_DIRECT,
  groups: ADMIN_GROUPS,
  // Hubs mantidos como opção de atalho para preservar defaults já salvos.
  extraShortcuts: [
    { label: "Calendário", to: "/dp/folgas", icon: Calendar, shortcut: true },
    { label: "Documentos", to: "/dp/documentos", icon: FileText, shortcut: true },
    { label: "Comunicação", to: "/dp/comunicacao", icon: BellRing, shortcut: true },
  ],
};

// ── Portal do colaborador ────────────────────────────────────────────────

const PORTAL_GROUPS: DpNavGroup[] = [
  {
    id: "minha-escala",
    label: "Minha Escala",
    icon: Calendar,
    matchPrefixes: [
      "/dp/meu/calendario",
      "/dp/meu/escala",
      "/dp/meu/convocacoes",
      "/dp/meu/trocas",
      "/dp/meu/solicitacoes",
      "/dp/meu/historico",
    ],
    items: [
      { label: "Calendário", to: "/dp/meu/calendario", icon: Calendar, shortcut: true },
      { label: "Minha Escala", to: "/dp/meu/escala", icon: CalendarRange, shortcut: true },
      { label: "Convocações", to: "/dp/meu/convocacoes", icon: BellRing, shortcut: true },
      { label: "Trocas", to: "/dp/meu/trocas", icon: Repeat, shortcut: true },
      { label: "Solicitações", to: "/dp/meu/solicitacoes", icon: ClipboardList, shortcut: true },
      { label: "Histórico", to: "/dp/meu/historico", icon: ListChecks, shortcut: true },
    ],
  },
  {
    id: "portal-documentos",
    label: "Documentos",
    icon: FileText,
    matchPrefixes: [
      "/dp/meu/documentos",
      "/dp/meu/atestados",
      "/dp/meu/disciplinar",
      "/dp/meu/sindicato",
    ],
    items: [
      { label: "Meus Documentos", to: "/dp/meu/documentos", icon: FileText, shortcut: true, shortLabel: "Documentos" },
      { label: "Atestados", to: "/dp/meu/atestados", icon: HeartPulse },
      { label: "Disciplinar", to: "/dp/meu/disciplinar", icon: ShieldAlert },
      { label: "Sindicato", to: "/dp/meu/sindicato", icon: Scale },
    ],
  },

];

const PORTAL_DIRECT: DpNavItem[] = [
  { label: "Mural", to: "/dp/meu/mural", icon: Megaphone, shortcut: true },
  { label: "Meu Cadastro", to: "/dp/meu/perfil", icon: User, shortcut: true, shortLabel: "Perfil" },
];

export const DP_PORTAL_NAV: DpNavSurface = {
  home: { label: "Início", to: "/dp/meu", icon: Home, end: true },
  direct: PORTAL_DIRECT,
  groups: PORTAL_GROUPS,
  extraShortcuts: [],
};

// ── Derivados ────────────────────────────────────────────────────────────

export function surfaceItems(surface: DpNavSurface): DpNavItem[] {
  return [...surface.direct, ...surface.groups.flatMap((g) => g.items)];
}

export function surfaceRoutes(surface: DpNavSurface): string[] {
  return [surface.home.to, ...surfaceItems(surface).map((i) => i.to)];
}

export function surfaceShortcuts(surface: DpNavSurface): DpNavItem[] {
  return [...surfaceItems(surface), ...surface.extraShortcuts].filter(
    (i) => i.shortcut,
  );
}

/** Rotas navegáveis principais do DP (usadas na guarda de paridade). */
export const DP_NAVIGABLE_ROUTES: string[] = surfaceRoutes(DP_ADMIN_NAV);
/** Rotas navegáveis principais do Portal (usadas na guarda de paridade). */
export const PORTAL_NAVIGABLE_ROUTES: string[] = surfaceRoutes(DP_PORTAL_NAV);
