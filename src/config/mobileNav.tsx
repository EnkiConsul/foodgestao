import {
  Home,
  LayoutGrid,
  List,
  Wallet,
  MoreHorizontal,
  Plus,
  Users,
  CheckSquare,
  Calendar,
  Inbox,
  User,
  ArrowLeftRight,
  CreditCard,
  RefreshCw,
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
  ClipboardList,
  BellRing,
  BookOpen,
  Repeat,
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
};

/** FAB central. Se ausente no módulo, um espaçador transparente é renderizado. */
export type NavFab = {
  icon: LucideIcon;
  label: string;
  /** Rota fallback quando nenhuma página registra ação via useMobileFab. */
  fallbackTo?: string;
};

export type MoreGroup = { label: string; items: NavLeaf[] };

/**
 * Configuração declarativa de navegação mobile por módulo.
 * Layout fixo: [Hub] [Início] [FAB] [Atalho customizável] [Mais].
 */
export type ModuleNav = {
  /** Link do slot "Hub" (sempre /hub). */
  hubTo: string;
  /** Link do slot "Início" — home do módulo atual. */
  home: NavLeaf;
  /** FAB central. Opcional — quando ausente, espaçador invisível. */
  fab?: NavFab;
  /** Atalho padrão do slot customizável do usuário. */
  defaultShortcut: NavLeaf;
  /** Opções elegíveis para o slot customizável. */
  shortcutOptions: NavLeaf[];
  /** Grupos exibidos no sheet "Mais". */
  moreGroups: MoreGroup[];
};

const contaGroup: MoreGroup = {
  label: "Conta",
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
  { icon: Users, label: "Colaboradores", to: "/dp/colaboradores" },
  { icon: CheckSquare, label: "Aprovações", to: "/dp/aprovacoes" },
  { icon: Calendar, label: "Folgas", to: "/dp/folgas" },
  { icon: FileText, label: "Documentos", to: "/dp/documentos" },
  { icon: BellRing, label: "Comunicação", to: "/dp/comunicacao" },
  { icon: Inbox, label: "Solicitações", to: "/dp/solicitacoes" },
  { icon: FileBarChart, label: "Histórico", to: "/dp/documentos/historico" },
];

// ── Portal do colaborador ────────────────────────────────────────────────
const portalHome: NavLeaf = { icon: Home, label: "Início", to: "/dp/meu", end: true };
const portalShortcuts: NavLeaf[] = [
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
  { icon: Search, label: "Buscar", to: "/buscar" },
  { icon: Home, label: "Financeiro", to: "/dashboard" },
  { icon: Users, label: "DP", to: "/dp" },
  { icon: Settings, label: "Configurações", to: "/configuracoes" },
];

// ── Admin ────────────────────────────────────────────────────────────────
const adminHome: NavLeaf = { icon: ShieldCheck, label: "Início", to: "/admin/estatisticas", end: true };
const adminShortcuts: NavLeaf[] = [
  { icon: BarChart3, label: "Estatísticas", to: "/admin/estatisticas" },
  { icon: Users, label: "Clientes", to: "/admin/clientes" },
  { icon: Package, label: "Assinaturas", to: "/admin/assinaturas" },
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

export const MODULE_NAV: Record<ActiveModule, ModuleNav> = {
  financeiro: {
    hubTo: "/hub",
    home: financeiroHome,
    fab: { icon: Plus, label: "Novo lançamento", fallbackTo: "/lancamentos?new=1" },
    defaultShortcut: financeiroShortcuts[0],
    shortcutOptions: financeiroShortcuts,
    moreGroups: [
      {
        label: "Operar",
        items: [
          { icon: ArrowLeftRight, label: "Transferências", to: "/transferencias" },
          { icon: CreditCard, label: "Cartões", to: "/cartoes-credito" },
          { icon: Repeat, label: "Recorrências", to: "/recorrencias" },
        ],
      },
      {
        label: "Cadastros",
        items: [
          { icon: Tags, label: "Categorias", to: "/categorias" },
          { icon: Contact, label: "Contatos", to: "/contatos" },
          { icon: Banknote, label: "Formas de pagamento", to: "/formas-pagamento" },
          { icon: Wallet, label: "Contas bancárias", to: "/contas-bancarias" },
        ],
      },
      {
        label: "Relatórios",
        items: [
          { icon: TrendingUp, label: "Fluxo de caixa", to: "/fluxo-caixa" },
          { icon: FileBarChart, label: "Relatórios", to: "/relatorios" },
          { icon: PiggyBank, label: "Orçamento", to: "/orcamento" },
        ],
      },
      contaGroup,
    ],
  },

  dp: {
    hubTo: "/hub",
    home: dpHome,
    fab: { icon: Plus, label: "Novo colaborador", fallbackTo: "/dp/colaboradores?new=1" },
    defaultShortcut: dpShortcuts[0],
    shortcutOptions: dpShortcuts,
    moreGroups: [
      {
        label: "Operar",
        items: [
          { icon: CheckSquare, label: "Aprovações", to: "/dp/aprovacoes" },
          { icon: Inbox, label: "Solicitações", to: "/dp/solicitacoes" },
          { icon: Calendar, label: "Folgas", to: "/dp/folgas" },
          { icon: ArrowLeftRight, label: "Trocas", to: "/dp/trocas" },
          { icon: FileText, label: "Documentos", to: "/dp/documentos" },
          { icon: BellRing, label: "Comunicação", to: "/dp/comunicacao" },
        ],
      },
      {
        label: "Cadastros",
        items: [
          { icon: Users, label: "Colaboradores", to: "/dp/colaboradores" },
          { icon: BookOpen, label: "Cargos", to: "/dp/cadastros/cargos" },
          { icon: Building2, label: "Unidades", to: "/dp/cadastros/unidades" },
          { icon: Calendar, label: "Datas bloqueadas", to: "/dp/bloqueios" },
          { icon: BellRing, label: "Pendências", to: "/dp/cadastros/pendencias" },
        ],
      },
      {
        label: "Relatórios",
        items: [{ icon: FileBarChart, label: "Histórico", to: "/dp/documentos/historico" }],
      },
      contaGroup,
    ],
  },

  portal_colaborador: {
    hubTo: "/hub",
    home: portalHome,
    fab: { icon: Plus, label: "Nova solicitação", fallbackTo: "/dp/meu/solicitacoes?new=1" },
    defaultShortcut: portalShortcuts[0],
    shortcutOptions: portalShortcuts,
    moreGroups: [
      {
        label: "Meu portal",
        items: [
          { icon: Calendar, label: "Meu calendário", to: "/dp/meu/calendario" },
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
    home: hubHome,
    defaultShortcut: hubShortcuts[0],
    shortcutOptions: hubShortcuts,
    moreGroups: [
      {
        label: "Ir para",
        items: [
          { icon: Home, label: "Financeiro", to: "/dashboard" },
          { icon: Users, label: "DP 360°", to: "/dp" },
          { icon: Search, label: "Buscar", to: "/buscar" },
        ],
      },
      contaGroup,
    ],
  },

  admin: {
    hubTo: "/hub",
    home: adminHome,
    defaultShortcut: adminShortcuts[1],
    shortcutOptions: adminShortcuts,
    moreGroups: [
      {
        label: "Backoffice",
        items: [
          { icon: BarChart3, label: "Estatísticas", to: "/admin/estatisticas" },
          { icon: Users, label: "Clientes", to: "/admin/clientes" },
          { icon: Package, label: "Assinaturas", to: "/admin/assinaturas" },
          { icon: FileText, label: "Faturas", to: "/admin/faturas" },
          { icon: Ticket, label: "Cupons", to: "/admin/cupons" },
          { icon: Landmark, label: "Bancos", to: "/admin/bancos" },
        ],
      },
      {
        label: "Configuração",
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
    home: contaHome,
    defaultShortcut: contaShortcuts[0],
    shortcutOptions: contaShortcuts,
    moreGroups: [contaGroup],
  },

  crm: {
    hubTo: "/hub",
    home: { icon: Home, label: "Início", to: "/crm", end: true },
    defaultShortcut: { icon: LayoutGrid, label: "Hub", to: "/hub" },
    shortcutOptions: [{ icon: LayoutGrid, label: "Hub", to: "/hub" }],
    moreGroups: [contaGroup],
  },
  rh: {
    hubTo: "/hub",
    home: { icon: Home, label: "Início", to: "/rh", end: true },
    defaultShortcut: { icon: LayoutGrid, label: "Hub", to: "/hub" },
    shortcutOptions: [{ icon: LayoutGrid, label: "Hub", to: "/hub" }],
    moreGroups: [contaGroup],
  },
  pedidos: {
    hubTo: "/hub",
    home: { icon: Home, label: "Início", to: "/pedidos", end: true },
    defaultShortcut: { icon: LayoutGrid, label: "Hub", to: "/hub" },
    shortcutOptions: [{ icon: LayoutGrid, label: "Hub", to: "/hub" }],
    moreGroups: [contaGroup],
  },
};
