import {
  Home,
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
  type LucideIcon,
} from "lucide-react";
import type { ActiveModule } from "@/hooks/useActiveModule";

export type NavLeaf = {
  type?: "link";
  icon: LucideIcon;
  label: string;
  to: string;
  end?: boolean;
};
export type NavFab = {
  type: "fab";
  icon: LucideIcon;
  label: string;
  /** Fallback route to open when no page registers a FAB action */
  fallbackTo?: string;
};
export type NavMore = { type: "more"; icon: LucideIcon; label: string };
export type NavSlot = NavLeaf | NavFab | NavMore;

export type MoreGroup = { label: string; items: NavLeaf[] };

export type MobileNavConfig = {
  bottom: NavSlot[];
  moreGroups: MoreGroup[];
};

const contaGroup: MoreGroup = {
  label: "Conta",
  items: [
    { icon: Building2, label: "Empresas", to: "/empresas" },
    { icon: Package, label: "Planos", to: "/planos" },
    { icon: FileText, label: "Faturas", to: "/faturas" },
    { icon: Settings, label: "Configurações", to: "/configuracoes" },
  ],
};

export const MOBILE_NAV: Partial<Record<ActiveModule, MobileNavConfig>> = {
  financeiro: {
    bottom: [
      { icon: Home, label: "Início", to: "/dashboard", end: true },
      { icon: List, label: "Lançamentos", to: "/lancamentos" },
      { type: "fab", icon: Plus, label: "Novo lançamento", fallbackTo: "/lancamentos?new=1" },
      { icon: Wallet, label: "Contas", to: "/contas" },
      { type: "more", icon: MoreHorizontal, label: "Mais" },
    ],
    moreGroups: [
      {
        label: "Operar",
        items: [
          { icon: ArrowLeftRight, label: "Transferências", to: "/transferencias" },
          { icon: CreditCard, label: "Cartões", to: "/cartoes" },
          { icon: Repeat, label: "Recorrências", to: "/recorrencias" },
        ],
      },
      {
        label: "Cadastros",
        items: [
          { icon: Tags, label: "Categorias", to: "/categorias" },
          { icon: Contact, label: "Contatos", to: "/contatos" },
          { icon: Banknote, label: "Métodos de pagamento", to: "/metodos-pagamento" },
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
    bottom: [
      { icon: Home, label: "Início", to: "/dp", end: true },
      { icon: Users, label: "Colaboradores", to: "/dp/colaboradores" },
      { type: "fab", icon: Plus, label: "Novo", fallbackTo: "/dp/colaboradores?new=1" },
      { icon: CheckSquare, label: "Aprovações", to: "/dp/aprovacoes" },
      { type: "more", icon: MoreHorizontal, label: "Mais" },
    ],
    moreGroups: [
      {
        label: "Operar",
        items: [
          { icon: ClipboardList, label: "Folha", to: "/dp/folha" },
          { icon: FileText, label: "Documentos", to: "/dp/documentos" },
          { icon: BellRing, label: "Comunicação", to: "/dp/comunicacao" },
        ],
      },
      {
        label: "Cadastros",
        items: [
          { icon: BookOpen, label: "Cargos", to: "/dp/cadastros/cargos" },
          { icon: Building2, label: "Unidades", to: "/dp/cadastros/unidades" },
          { icon: Calendar, label: "Datas bloqueadas", to: "/dp/bloqueios" },
          { icon: BellRing, label: "Pendências", to: "/dp/cadastros/pendencias" },
        ],
      },
      {
        label: "Relatórios",
        items: [
          { icon: FileBarChart, label: "Histórico", to: "/dp/historico" },
        ],
      },
      contaGroup,
    ],
  },

  portal_colaborador: {
    bottom: [
      { icon: Home, label: "Início", to: "/dp/meu", end: true },
      { icon: Calendar, label: "Calendário", to: "/dp/meu/calendario" },
      { type: "fab", icon: Plus, label: "Nova solicitação", fallbackTo: "/dp/meu/solicitacoes?new=1" },
      { icon: Inbox, label: "Solicitações", to: "/dp/meu/solicitacoes" },
      { icon: User, label: "Perfil", to: "/dp/meu/perfil" },
    ],
    moreGroups: [],
  },
};

/** Módulos que não usam a BottomNav (Hub, Admin, Conta genérica, "coming soon"). */
export const MODULES_WITHOUT_BOTTOM_NAV: ActiveModule[] = ["hub", "admin"];
