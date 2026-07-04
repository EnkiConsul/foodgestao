import {
  LayoutDashboard,
  ArrowLeftRight,
  Wallet,
  TrendingUp,
  Target,
  FileBarChart,
  Users,
  UserCog,
  FolderTree,
  Landmark,
  Building2,
  CreditCard,
  Settings,
  LogOut,
  Shield,
  Sparkles,
  Bot,
  Receipt,
  MessageCircle,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { Logo } from "@/components/Logo";

import { useAuth } from "@/hooks/useAuth";
import { useSuperAdmin } from "@/hooks/useSuperAdmin";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";

const financeiroItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Lançamentos", url: "/lancamentos", icon: ArrowLeftRight },
  { title: "Fluxo de Caixa", url: "/fluxo-caixa", icon: TrendingUp },
  { title: "Orçamento", url: "/orcamento", icon: Target },
  { title: "Relatórios", url: "/relatorios", icon: FileBarChart },
  { title: "DRE Contábil", url: "/relatorios/dre", icon: Receipt },
  { title: "Plin IA", url: "/plin-ia", icon: Bot },
];

const cadastrosItems = [
  { title: "Perfis de Acesso", url: "/empresas", icon: Building2 },
  { title: "Contas Bancárias", url: "/contas-bancarias", icon: Landmark },
  { title: "Formas de Pagamento", url: "/formas-pagamento", icon: CreditCard },
  { title: "Clientes / Fornecedores", url: "/contatos", icon: Users },
  { title: "Categorias", url: "/categorias", icon: FolderTree },
];

const cobrancaItems = [
  { title: "Meu Plano", url: "/planos", icon: Sparkles },
  { title: "Minhas Faturas", url: "/faturas", icon: Receipt },
];

const configItems = [
  { title: "Usuários", url: "/gestao-usuarios", icon: UserCog },
  { title: "Configurações", url: "/configuracoes", icon: Settings },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";

  const { signOut } = useAuth();
  const { isSuperAdmin } = useSuperAdmin();

  const visibleConfigItems = isSuperAdmin
    ? [...configItems, { title: "Backoffice", url: "/admin", icon: Shield }]
    : configItems;

  return (
    <Sidebar className="border-r-0" collapsible="icon">
      <SidebarHeader className="p-4 border-b border-sidebar-border mb-2">
        <div className="flex items-center justify-center gap-2">
          <Logo variant="icon" size="sm" linkTo={null} className="h-8 shrink-0" />
          {!collapsed && (
            <div className="flex items-baseline gap-0.5">
              <span className="text-xl font-bold tracking-tight text-sidebar-foreground">Gestor</span>
              <span className="text-xl font-bold tracking-tight text-sidebar-primary">Plin</span>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        {[
          { label: "Financeiro", items: financeiroItems },
          { label: "Cadastros", items: cadastrosItems },
          { label: "Cobrança", items: cobrancaItems },
          { label: "Configurações", items: visibleConfigItems },
        ].map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel className="text-sidebar-foreground/70 text-xs uppercase tracking-wider px-5">
              {group.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild>
                      <NavLink
                        to={item.url}
                        end={item.url === "/"}
                        className="flex items-center gap-3 px-5 py-2.5 text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground rounded-lg mx-2 transition-all duration-200 hover:translate-x-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
                        activeClassName="bg-sidebar-accent text-sidebar-foreground font-medium translate-x-1"
                      >
                        <item.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                        <span>{item.title}</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="p-4 border-t border-sidebar-border space-y-1">
        <a
          href="https://wa.me/5562992365959"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 w-full px-3 py-2 text-sm text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent rounded-lg transition-colors"
        >
          <MessageCircle className="h-4 w-4" />
          <span>Suporte</span>
        </a>
        <button
          onClick={signOut}
          className="flex items-center gap-2 w-full px-3 py-2 text-sm text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent rounded-lg transition-colors"
        >
          <LogOut className="h-4 w-4" />
          <span>Sair</span>
        </button>
      </SidebarFooter>
    </Sidebar>
  );
}
