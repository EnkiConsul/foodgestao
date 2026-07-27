import {
  Home,
  Megaphone,
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
  LayoutDashboard,
  Briefcase,
  Scale,
  UserCheck,
  Ban,
  Coins,
  Clock,
  HeartPulse,
  ShieldAlert,
  ListChecks,
  FileSignature,
  MessageSquare,
  Bell,
  Repeat,
  UserCog,
  Sparkles,
  Receipt,
  Webhook,
  Database,
  Brain,
  Tag,
  FolderTree,
  Palmtree,
  CalendarRange,
  Gift,
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

/** Subgrupo dentro de uma seção — espelha grupos colapsáveis/estáticos do sidebar desktop. */
export type MoreSubGroup = {
  kind: "collapsible" | "static";
  label: string;
  icon: LucideIcon;
  /** Rota do "hub" da seção (ex.: /dp/cadastros) — vira link "Ver visão geral". */
  hubTo?: string;
  /** Prefixos que fazem o grupo abrir automaticamente. */
  matchPrefixes?: string[];
  items: NavLeaf[];
};

export type MoreGroup = {
  label: string;
  accent?: GroupAccent;
  items?: NavLeaf[];
  subgroups?: MoreSubGroup[];
};

/**
 * Configuração declarativa de navegação mobile por módulo.
 * Layout fixo: [Hub / Atalho C] [Atalho A] [Início destacado] [Atalho B] [Mais].
 */
export type ModuleNav = {
  hubTo: string;
  moreTo: string;
  home: NavLeaf;
  defaultShortcutA: NavLeaf;
  defaultShortcutB: NavLeaf;
  /** Somente usado no módulo Hub (Slot 1 vira 3º atalho personalizável). */
  defaultShortcutC?: NavLeaf;
  shortcutOptions: NavLeaf[];
  moreGroups: MoreGroup[];
};

// ── Conta (compartilhado) ────────────────────────────────────────────────
const contaGroup: MoreGroup = {
  label: "Conta",
  accent: "muted",
  items: [
    { icon: Building2, label: "Minhas Empresas", to: "/empresas" },
    { icon: UserCog, label: "Usuários", to: "/gestao-usuarios" },
    { icon: Sparkles, label: "Meu Plano", to: "/planos" },
    { icon: Receipt, label: "Minhas Faturas", to: "/faturas" },
    { icon: Settings, label: "Configurações", to: "/configuracoes" },
  ],
};

const contaGroupPortal: MoreGroup = {
  label: "Conta",
  accent: "muted",
  items: [{ icon: Settings, label: "Configurações", to: "/configuracoes" }],
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
  { icon: Palmtree, label: "Férias", to: "/dp/ferias" },
  { icon: CalendarRange, label: "Escalas", to: "/dp/escalas" },
  { icon: Clock, label: "Jornadas", to: "/dp/cadastros/jornadas" },
  { icon: ShieldCheck, label: "Conformidade", to: "/dp/conformidade" },
  { icon: Gift, label: "Benefícios", to: "/dp/beneficios" },
  { icon: BarChart3, label: "Analytics", to: "/dp/analytics" },
];

// ── Portal do colaborador ────────────────────────────────────────────────
const portalHome: NavLeaf = { icon: Home, label: "Início", to: "/dp/meu", end: true };
const portalShortcuts: NavLeaf[] = [
  { icon: Home, label: "Financeiro", to: "/dashboard" },
  { icon: Users, label: "DP", to: "/dp" },
  { icon: Megaphone, label: "Mural", to: "/dp/meu/mural" },
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

/**
 * ─────────────────────────────────────────────────────────────────────────
 * DEFAULTS GLOBAIS DOS ATALHOS (aplicados a todos os usuários novos).
 * Cada valor é a rota (`to`) de um item presente em `shortcutOptions` do módulo.
 * Se a rota não existir na lista, cai no primeiro item disponível.
 * Usuários que já personalizaram (dp_user_prefs / localStorage) mantêm sua escolha.
 * ─────────────────────────────────────────────────────────────────────────
 */
const GLOBAL_SHORTCUT_DEFAULTS: Record<
  ActiveModule,
  { A: string; B: string; C?: string }
> = {
  financeiro: { A: "/lancamentos", B: "/contas-bancarias" },
  dp:         { A: "/dp/folgas", B: "/dp/documentos" },
  portal_colaborador: { A: "/dashboard", B: "/dp" },
  hub:        { A: "/dashboard", B: "/dp", C: "/buscar" },
  admin:      { A: "/admin/clientes", B: "/admin/assinaturas" },
  conta:      { A: "/empresas", B: "/gestao-usuarios" },
  crm:        { A: "/hub", B: "/hub" },
  rh:         { A: "/hub", B: "/hub" },
  pedidos:    { A: "/hub", B: "/hub" },
};

function pickShortcut(list: NavLeaf[], to: string | undefined, fallbackIdx = 0): NavLeaf {
  if (to) {
    const found = list.find((l) => l.to === to);
    if (found) return found;
  }
  return list[fallbackIdx] ?? list[0];
}


export const MODULE_NAV: Record<ActiveModule, ModuleNav> = {
  financeiro: {
    hubTo: "/hub",
    moreTo: "/mais",
    home: financeiroHome,
    defaultShortcutA: pickShortcut(financeiroShortcuts, GLOBAL_SHORTCUT_DEFAULTS.financeiro.A, 0),
    defaultShortcutB: pickShortcut(financeiroShortcuts, GLOBAL_SHORTCUT_DEFAULTS.financeiro.B, 1),
    shortcutOptions: financeiroShortcuts,
    moreGroups: [
      {
        label: "Financeiro 360°",
        accent: "primary",
        items: [
          { icon: ArrowLeftRight, label: "Lançamentos", to: "/lancamentos", end: true },
          { icon: TrendingUp, label: "Fluxo de Caixa", to: "/fluxo-caixa", end: true },
          { icon: PiggyBank, label: "Orçamento", to: "/orcamento", end: true },
        ],
        subgroups: [
          {
            kind: "collapsible",
            label: "Relatórios",
            icon: FileBarChart,
            hubTo: "/relatorios",
            matchPrefixes: ["/relatorios"],
            items: [
              { icon: FileBarChart, label: "Financeiros", to: "/relatorios", end: true },
              { icon: BookOpen, label: "Contábeis", to: "/relatorios/contabeis", end: true },
            ],
          },
        ],
      },
      {
        label: "Cadastros",
        accent: "navy",
        items: [
          { icon: Landmark, label: "Contas Bancárias", to: "/contas-bancarias" },
          { icon: CreditCard, label: "Cartões de Crédito", to: "/cartoes-credito" },
          { icon: Banknote, label: "Formas de Pagamento", to: "/formas-pagamento" },
          { icon: Contact, label: "Clientes / Fornecedores", to: "/contatos" },
          { icon: FolderTree, label: "Categorias", to: "/categorias" },
          { icon: BookOpen, label: "Contas Contábeis", to: "/contas-contabeis" },
        ],
      },
      contaGroup,
    ],
  },

  dp: {
    hubTo: "/hub",
    moreTo: "/dp/mais",
    home: dpHome,
    defaultShortcutA: pickShortcut(dpShortcuts, GLOBAL_SHORTCUT_DEFAULTS.dp.A, 0),
    defaultShortcutB: pickShortcut(dpShortcuts, GLOBAL_SHORTCUT_DEFAULTS.dp.B, 1),
    shortcutOptions: dpShortcuts,
    moreGroups: [
      {
        label: "DP 360°",
        accent: "primary",
        items: [
          { icon: ShieldCheck, label: "Conformidade", to: "/dp/conformidade" },
          { icon: Gift, label: "Benefícios", to: "/dp/beneficios" },
          { icon: BarChart3, label: "Analytics de RH", to: "/dp/analytics" },
        ],
        subgroups: [
          {
            kind: "collapsible",
            label: "Cadastro",
            icon: Users,
            hubTo: "/dp/cadastros",
            matchPrefixes: ["/dp/colaboradores", "/dp/cadastros"],
            items: [
              { icon: Users, label: "Colaboradores", to: "/dp/colaboradores" },
              { icon: Briefcase, label: "Cargos", to: "/dp/cadastros/cargos" },
              { icon: Building2, label: "Unidades", to: "/dp/cadastros/unidades" },
              { icon: Scale, label: "Sindicatos", to: "/dp/cadastros/sindicatos" },
              { icon: Clock, label: "Jornadas e Escalas", to: "/dp/cadastros/jornadas" },
              { icon: BellRing, label: "Pendências", to: "/dp/cadastros/pendencias" },
            ],
          },
          {
            kind: "collapsible",
            label: "Folgas",
            icon: Calendar,
            hubTo: "/dp/folgas",
            matchPrefixes: [
              "/dp/folgas",
              "/dp/solicitacoes",
              "/dp/aprovacoes",
              "/dp/trocas",
              "/dp/bloqueios",
              "/dp/ferias",
              "/dp/escalas",
              "/dp/conformidade-dsr",
            ],
            items: [
              { icon: Calendar, label: "Calendário Geral", to: "/dp/folgas/calendario" },
              { icon: Inbox, label: "Solicitações", to: "/dp/solicitacoes" },
              { icon: UserCheck, label: "Aprovações", to: "/dp/aprovacoes" },
              { icon: ArrowLeftRight, label: "Trocas", to: "/dp/trocas" },
              { icon: Ban, label: "Datas Bloqueadas", to: "/dp/bloqueios" },
              { icon: Palmtree, label: "Férias", to: "/dp/ferias" },
              { icon: CalendarRange, label: "Gerador de Escala", to: "/dp/escalas" },
              { icon: Scale, label: "Conformidade DSR", to: "/dp/conformidade-dsr" },
              { icon: Settings, label: "Regras de Folgas", to: "/dp/folgas/configuracoes/regras" },
            ],
          },
          {
            kind: "collapsible",
            label: "Documentos",
            icon: FileText,
            hubTo: "/dp/documentos",
            matchPrefixes: ["/dp/documentos", "/dp/disciplinar", "/dp/atestados"],

            items: [
              { icon: FileText, label: "Contracheques", to: "/dp/documentos/contracheque" },
              { icon: Coins, label: "Adiantamentos", to: "/dp/documentos/adiantamento" },
              { icon: Clock, label: "Folhas de Ponto", to: "/dp/documentos/ponto" },
              { icon: HeartPulse, label: "Atestados", to: "/dp/atestados" },
              { icon: ShieldAlert, label: "Registros Disciplinares", to: "/dp/disciplinar" },
              { icon: FileSignature, label: "ACT-CCT", to: "/dp/documentos/act-cct" },
              { icon: ListChecks, label: "Histórico Completo", to: "/dp/documentos/historico" },
            ],
          },
          {
            kind: "collapsible",
            label: "Comunicação",
            icon: MessageSquare,
            hubTo: "/dp/comunicacao",
            matchPrefixes: ["/dp/comunicacao", "/dp/mensagens", "/dp/avisos"],
            items: [
              { icon: MessageSquare, label: "Mensagens", to: "/dp/mensagens" },
              { icon: Bell, label: "Quadro de Avisos", to: "/dp/avisos" },
            ],
          },
        ],
      },
      contaGroup,
    ],
  },

  portal_colaborador: {
    hubTo: "/hub",
    moreTo: "/dp/meu/mais",
    home: portalHome,
    defaultShortcutA: pickShortcut(portalShortcuts, GLOBAL_SHORTCUT_DEFAULTS.portal_colaborador.A, 0),
    defaultShortcutB: pickShortcut(portalShortcuts, GLOBAL_SHORTCUT_DEFAULTS.portal_colaborador.B, 1),
    shortcutOptions: portalShortcuts,
    moreGroups: [
      {
        label: "Portal",
        accent: "navy",
        items: [
          { icon: Megaphone, label: "Mural", to: "/dp/meu/mural" },
          { icon: Settings, label: "Meu Cadastro", to: "/dp/meu/perfil" },
        ],
        subgroups: [
          {
            kind: "static",
            label: "Folgas",
            icon: Calendar,
            items: [
              { icon: Calendar, label: "Calendário", to: "/dp/meu/calendario" },
              { icon: Repeat, label: "Trocas", to: "/dp/meu/trocas" },
              { icon: ListChecks, label: "Histórico", to: "/dp/meu/historico" },
              { icon: Inbox, label: "Solicitações", to: "/dp/meu/solicitacoes" },
            ],
          },
          {
            kind: "static",
            label: "Documentos",
            icon: FileText,
            items: [
              { icon: FileText, label: "Meus Documentos", to: "/dp/meu/documentos" },
              { icon: HeartPulse, label: "Atestados", to: "/dp/meu/atestados" },
              { icon: ShieldAlert, label: "Disciplinar", to: "/dp/meu/disciplinar" },
              { icon: Scale, label: "Sindicato", to: "/dp/meu/sindicato" },
            ],
          },
        ],
      },
      contaGroupPortal,
    ],
  },

  hub: {
    hubTo: "/hub",
    moreTo: "/mais",
    home: hubHome,
    defaultShortcutA: pickShortcut(hubShortcuts, GLOBAL_SHORTCUT_DEFAULTS.hub.A, 0),
    defaultShortcutB: pickShortcut(hubShortcuts, GLOBAL_SHORTCUT_DEFAULTS.hub.B, 1),
    defaultShortcutC: pickShortcut(hubShortcuts, GLOBAL_SHORTCUT_DEFAULTS.hub.C, 2),
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
    defaultShortcutA: pickShortcut(adminShortcuts, GLOBAL_SHORTCUT_DEFAULTS.admin.A, 0),
    defaultShortcutB: pickShortcut(adminShortcuts, GLOBAL_SHORTCUT_DEFAULTS.admin.B, 1),
    shortcutOptions: adminShortcuts,
    moreGroups: [
      {
        label: "Visão geral",
        accent: "primary",
        items: [
          { icon: BarChart3, label: "Estatísticas", to: "/admin/estatisticas" },
          { icon: FileText, label: "Landing Page", to: "/admin/landing-page" },
          { icon: ScrollText, label: "Documentos Legais", to: "/admin/documentos-legais" },
          { icon: ScrollText, label: "Auditoria", to: "/admin/auditoria" },
          { icon: Search, label: "Indexação SEO", to: "/admin/seo-indexacao" },
        ],
      },
      {
        label: "Cobrança",
        accent: "amber",
        items: [
          { icon: Sparkles, label: "Planos", to: "/admin/planos" },
          { icon: CreditCard, label: "Assinaturas", to: "/admin/assinaturas" },
          { icon: Receipt, label: "Faturamento", to: "/admin/faturamento" },
          { icon: Tag, label: "Cupons", to: "/admin/cupons" },
          { icon: Receipt, label: "Faturas", to: "/admin/faturas" },
          { icon: Webhook, label: "Webhooks Asaas", to: "/admin/webhooks-asaas" },
        ],
      },
      {
        label: "Tenants",
        accent: "navy",
        items: [
          { icon: Users, label: "Clientes", to: "/admin/clientes" },
          { icon: UserCog, label: "Cadastros", to: "/admin/cadastros" },
          { icon: Building2, label: "Perfis de Acesso", to: "/admin/perfis-acesso" },
          { icon: Sparkles, label: "Módulos", to: "/admin/modulos" },
          { icon: Landmark, label: "Bancos", to: "/admin/bancos" },
          { icon: Database, label: "Resetar Dados", to: "/admin/resetar-dados" },
          { icon: Brain, label: "Categorização IA", to: "/admin/categorizacao-ia" },
        ],
      },
    ],
  },

  conta: {
    hubTo: "/hub",
    moreTo: "/mais",
    home: contaHome,
    defaultShortcutA: pickShortcut(contaShortcuts, GLOBAL_SHORTCUT_DEFAULTS.conta.A, 0),
    defaultShortcutB: pickShortcut(contaShortcuts, GLOBAL_SHORTCUT_DEFAULTS.conta.B, 1),
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
