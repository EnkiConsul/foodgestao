import {
  Home,
  LayoutGrid,
  List,
  Wallet,
  Users,
  CheckSquare,
  Calendar,
  Inbox,
  User,
  ArrowLeftRight,
  CreditCard,
  Repeat,
  Tags,
  Contact,
  Banknote,
  TrendingUp,
  FileBarChart,
  PiggyBank,
  Building2,
  Package,
  Settings,
  FileText,
  BellRing,
  BookOpen,
  ShieldCheck,
  BarChart3,
  Ticket,
  Landmark,
  ScrollText,
  Search,
  type LucideIcon,
} from "lucide-react";
import type { ActiveModule } from "@/hooks/useActiveModule";

/** Item de navegação simples (link). */
export type NavLeaf = {
  icon: LucideIcon;
  label: string;
  to: string;
  end?: boolean;
  /** Se true, ocupa a linha inteira na página "Mais" (item de destaque). */
  featured?: boolean;
};

/** Chave semântica de cor para o chip do grupo na página "Mais". */
export type GroupAccent = "primary" | "navy" | "amber" | "slate" | "muted";

export type MoreGroup = {
  label: string;
  items: NavLeaf[];
  accent?: GroupAccent;
};

/**
 * Configuração declarativa de navegação mobile por módulo.
 * Layout fixo: [Hub / Atalho C] [Atalho A] [Início destacado] [Atalho B] [Mais].
 */
export type ModuleNav = {
  /** Link do slot "Hub" (sempre /hub). */
  hubTo: string;
  /** Rota da página "Mais" contextual do módulo. */
  moreTo: string;
  /** Botão central destacado — home do módulo. */
  home: NavLeaf;
  /** Atalho padrão do slot esquerdo customizável. */
  defaultShortcutA: NavLeaf;
  /** Atalho padrão do slot direito customizável. */
  defaultShortcutB: NavLeaf;
  /** Opções elegíveis para os slots customizáveis. */
  shortcutOptions: NavLeaf[];
  /** Grupos exibidos na página "Mais". */
  moreGroups: MoreGroup[];
};

const contaGroup: MoreGroup = {
  label: "Conta",
  accent: "muted",
  items: [
    { icon: Building2, label: "Empresas", to: "/empresas" },
    { icon: Users, label: "Usuários", to: "/gestao-usuarios" },
    { icon: Package, label: "Planos", to: "/planos" },
    { icon: FileText, label: "Faturas", to: "/faturas" },
    { icon: Settings, label: "Configurações", to: "/configuracoes" },
  ],
};

// ── Financeiro ───────────────────────────────────────────────────────────
const financeiroHome: NavLeaf = { icon: Home, label: "Início", to: "/dashboard", end: true };
const financeiroShortcuts: NavLeaf[] = [
  { icon: List, label: "Lançamentos", to: "/lancamentos" },
  { icon: Wallet, label: "Contas", to: "/contas-bancarias" },
  { icon: CreditCard, label: "Cartões", to: "/cartoes-credito" },
  { icon: TrendingUp, label: "Fluxo caixa", to: "/fluxo-caixa" },
  { icon: FileBarChart, label: "Relatórios", to: "/relatorios" },
  { icon: Tags, label: "Categorias", to: "/categorias" },
  { icon: Contact, label: "Contatos", to: "/contatos" },
  { icon: PiggyBank, label: "Orçamento", to: "/orcamento" },
];

// ── DP ───────────────────────────────────────────────────────────────────
const dpHome: NavLeaf = { icon: Home, label: "Início", to: "/dp", end: true };
const dpShortcuts: NavLeaf[] = [
  { icon: Calendar, label: "Calendário", to: "/dp/folgas" },
  { icon: FileText, label: "Documentos", to: "/dp/documentos" },
  { icon: Users, label: "Colaboradores", to: "/dp/colaboradores" },
  { icon: CheckSquare, label: "Aprovações", to: "/dp/aprovacoes" },
  { icon: BellRing, label: "Comunicação", to: "/dp/comunicacao" },
  { icon: Inbox, label: "Solicitações", to: "/dp/solicitacoes" },
  { icon: FileBarChart, label: "Histórico", to: "/dp/documentos/historico" },
];

// ── Portal do colaborador ────────────────────────────────────────────────
const portalHome: NavLeaf = { icon: Home, label: "Início", to: "/dp/meu", end: true };
const portalShortcuts: NavLeaf[] = [
  { icon: Home, label: "Financeiro", to: "/dashboard" },
  { icon: Users, label: "DP", to: "/dp" },
  { icon: Calendar, label: "Calendário", to: "/dp/meu/calendario" },
  { icon: Inbox, label: "Solicitações", to: "/dp/meu/solicitacoes" },
  { icon: FileText, label: "Documentos", to: "/dp/meu/documentos" },
  { icon: ArrowLeftRight, label: "Trocas", to: "/dp/meu/trocas" },
  { icon: FileBarChart, label: "Histórico", to: "/dp/meu/historico" },
  { icon: User, label: "Perfil", to: "/dp/meu/perfil" },
];

// ── Hub ──────────────────────────────────────────────────────────────────
const hubHome: NavLeaf = { icon: LayoutGrid, label: "Módulos", to: "/hub", end: true };
const hubShortcuts: NavLeaf[] = [
  { icon: Home, label: "Financeiro", to: "/dashboard" },
  { icon: Users, label: "DP", to: "/dp" },
  { icon: Search, label: "Buscar", to: "/buscar" },
  { icon: Settings, label: "Configurações", to: "/configuracoes" },
];

// ── Admin ────────────────────────────────────────────────────────────────
const adminHome: NavLeaf = { icon: ShieldCheck, label: "Início", to: "/admin/estatisticas", end: true };
const adminShortcuts: NavLeaf[] = [
  { icon: Users, label: "Clientes", to: "/admin/clientes" },
  { icon: Package, label: "Assinaturas", to: "/admin/assinaturas" },
  { icon: BarChart3, label: "Estatísticas", to: "/admin/estatisticas" },
  { icon: FileText, label: "Faturas", to: "/admin/faturas" },
  { icon: Ticket, label: "Cupons", to: "/admin/cupons" },
  { icon: Landmark, label: "Bancos", to: "/admin/bancos" },
  { icon: ScrollText, label: "Auditoria", to: "/admin/auditoria" },
];

// ── Conta ────────────────────────────────────────────────────────────────
const contaHome: NavLeaf = { icon: Settings, label: "Início", to: "/configuracoes", end: true };
const contaShortcuts: NavLeaf[] = [
  { icon: Building2, label: "Empresas", to: "/empresas" },
  { icon: Users, label: "Usuários", to: "/gestao-usuarios" },
  { icon: Package, label: "Planos", to: "/planos" },
  { icon: FileText, label: "Faturas", to: "/faturas" },
];

const noopShortcut: NavLeaf = { icon: LayoutGrid, label: "Hub", to: "/hub" };

export const MODULE_NAV: Record<ActiveModule, ModuleNav> = {
  financeiro: {
    hubTo: "/hub",
    moreTo: "/mais",
    home: financeiroHome,
    defaultShortcutA: financeiroShortcuts[0],
    defaultShortcutB: financeiroShortcuts[1],
    shortcutOptions: financeiroShortcuts,
    moreGroups: [
      {
        label: "Operar",
        accent: "primary",
        items: [
          { icon: List, label: "Lançamentos", to: "/lancamentos", featured: true },
          { icon: ArrowLeftRight, label: "Transferências", to: "/transferencias" },
          { icon: CreditCard, label: "Cartões", to: "/cartoes-credito" },
          { icon: Repeat, label: "Recorrências", to: "/recorrencias" },
        ],
      },
      {
        label: "Cadastros",
        accent: "navy",
        items: [
          { icon: Tags, label: "Categorias", to: "/categorias" },
          { icon: Contact, label: "Contatos", to: "/contatos" },
          { icon: Banknote, label: "Formas de pagamento", to: "/formas-pagamento" },
          { icon: Wallet, label: "Contas bancárias", to: "/contas-bancarias" },
        ],
      },
      {
        label: "Relatórios",
        accent: "amber",
        items: [
          { icon: TrendingUp, label: "Fluxo de caixa", to: "/fluxo-caixa", featured: true },
          { icon: FileBarChart, label: "Relatórios", to: "/relatorios" },
          { icon: PiggyBank, label: "Orçamento", to: "/orcamento" },
        ],
      },
      contaGroup,
    ],
  },

  dp: {
    hubTo: "/hub",
    moreTo: "/dp/mais",
    home: dpHome,
    defaultShortcutA: dpShortcuts[0],
    defaultShortcutB: dpShortcuts[1],
    shortcutOptions: dpShortcuts,
    moreGroups: [
      {
        label: "Operar",
        accent: "primary",
        items: [
          { icon: CheckSquare, label: "Aprovações", to: "/dp/aprovacoes", featured: true },
          { icon: Inbox, label: "Solicitações", to: "/dp/solicitacoes" },
          { icon: Calendar, label: "Folgas", to: "/dp/folgas" },
          { icon: ArrowLeftRight, label: "Trocas", to: "/dp/trocas" },
          { icon: FileText, label: "Documentos", to: "/dp/documentos" },
          { icon: BellRing, label: "Comunicação", to: "/dp/comunicacao" },
        ],
      },
      {
        label: "Cadastros",
        accent: "navy",
        items: [
          { icon: Users, label: "Colaboradores", to: "/dp/colaboradores", featured: true },
          { icon: BookOpen, label: "Cargos", to: "/dp/cadastros/cargos" },
          { icon: Building2, label: "Unidades", to: "/dp/cadastros/unidades" },
          { icon: Calendar, label: "Datas bloqueadas", to: "/dp/bloqueios" },
          { icon: BellRing, label: "Pendências", to: "/dp/cadastros/pendencias" },
        ],
      },
      {
        label: "Relatórios",
        accent: "amber",
        items: [{ icon: FileBarChart, label: "Histórico", to: "/dp/documentos/historico" }],
      },
      contaGroup,
    ],
  },

  portal_colaborador: {
    hubTo: "/hub",
    moreTo: "/dp/meu/mais",
    home: portalHome,
    defaultShortcutA: portalShortcuts[0],
    defaultShortcutB: portalShortcuts[1],
    shortcutOptions: portalShortcuts,
    moreGroups: [
      {
        label: "Meu portal",
        accent: "navy",
        items: [
          { icon: Calendar, label: "Meu calendário", to: "/dp/meu/calendario", featured: true },
          { icon: Inbox, label: "Solicitações", to: "/dp/meu/solicitacoes" },
          { icon: ArrowLeftRight, label: "Trocas", to: "/dp/meu/trocas" },
          { icon: FileText, label: "Documentos", to: "/dp/meu/documentos" },
          { icon: FileBarChart, label: "Histórico", to: "/dp/meu/historico" },
          { icon: User, label: "Perfil", to: "/dp/meu/perfil" },
        ],
      },
    ],
  },

  hub: {
    hubTo: "/hub",
    moreTo: "/mais",
    home: hubHome,
    defaultShortcutA: hubShortcuts[0],
    defaultShortcutB: hubShortcuts[1],
    shortcutOptions: hubShortcuts,
    moreGroups: [
      {
        label: "Ir para",
        accent: "primary",
        items: [
          { icon: Home, label: "Financeiro", to: "/dashboard", featured: true },
          { icon: Users, label: "DP 360°", to: "/dp" },
          { icon: Search, label: "Buscar", to: "/buscar" },
        ],
      },
      contaGroup,
    ],
  },

  admin: {
    hubTo: "/hub",
    moreTo: "/admin/mais",
    home: adminHome,
    defaultShortcutA: adminShortcuts[0],
    defaultShortcutB: adminShortcuts[1],
    shortcutOptions: adminShortcuts,
    moreGroups: [
      {
        label: "Backoffice",
        accent: "primary",
        items: [
          { icon: BarChart3, label: "Estatísticas", to: "/admin/estatisticas", featured: true },
          { icon: Users, label: "Clientes", to: "/admin/clientes" },
          { icon: Package, label: "Assinaturas", to: "/admin/assinaturas" },
          { icon: FileText, label: "Faturas", to: "/admin/faturas" },
          { icon: Ticket, label: "Cupons", to: "/admin/cupons" },
          { icon: Landmark, label: "Bancos", to: "/admin/bancos" },
        ],
      },
      {
        label: "Configuração",
        accent: "slate",
        items: [
          { icon: Package, label: "Planos", to: "/admin/planos" },
          { icon: Package, label: "Módulos", to: "/admin/modulos" },
          { icon: Users, label: "Perfis de acesso", to: "/admin/perfis-acesso" },
          { icon: ScrollText, label: "Auditoria", to: "/admin/auditoria" },
          { icon: FileText, label: "Cadastros", to: "/admin/cadastros" },
          { icon: FileText, label: "Documentos legais", to: "/admin/documentos-legais" },
        ],
      },
      contaGroup,
    ],
  },

  conta: {
    hubTo: "/hub",
    moreTo: "/mais",
    home: contaHome,
    defaultShortcutA: contaShortcuts[0],
    defaultShortcutB: contaShortcuts[1],
    shortcutOptions: contaShortcuts,
    moreGroups: [contaGroup],
  },

  crm: {
    hubTo: "/hub",
    moreTo: "/mais",
    home: { icon: Home, label: "Início", to: "/crm", end: true },
    defaultShortcutA: noopShortcut,
    defaultShortcutB: noopShortcut,
    shortcutOptions: [noopShortcut],
    moreGroups: [contaGroup],
  },
  rh: {
    hubTo: "/hub",
    moreTo: "/mais",
    home: { icon: Home, label: "Início", to: "/rh", end: true },
    defaultShortcutA: noopShortcut,
    defaultShortcutB: noopShortcut,
    shortcutOptions: [noopShortcut],
    moreGroups: [contaGroup],
  },
  pedidos: {
    hubTo: "/hub",
    moreTo: "/mais",
    home: { icon: Home, label: "Início", to: "/pedidos", end: true },
    defaultShortcutA: noopShortcut,
    defaultShortcutB: noopShortcut,
    shortcutOptions: [noopShortcut],
    moreGroups: [contaGroup],
  },
};
