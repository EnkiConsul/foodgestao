import {
  BarChart3,
  Users,
  Sparkles,
  CreditCard,
  Receipt,
  Tag,
  Building2,
  ScrollText,
  Database,
  ShieldCheck,
  ArrowLeft,
  LogOut,
  Webhook,
  FileText,
  Landmark,
  Search,
  Brain,
  UserCog,
  AlertTriangle,
  Activity,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useAuth } from "@/hooks/useAuth";
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

const overviewItems = [
  { title: "Estatísticas", url: "/admin/estatisticas", icon: BarChart3 },
  { title: "Landing Page", url: "/admin/landing-page", icon: FileText },
  { title: "Documentos Legais", url: "/admin/documentos-legais", icon: ScrollText },
  { title: "Auditoria", url: "/admin/auditoria", icon: ScrollText },
  { title: "Indexação SEO", url: "/admin/seo-indexacao", icon: Search },
];

const billingItems = [
  { title: "Planos", url: "/admin/planos", icon: Sparkles },
  { title: "Assinaturas", url: "/admin/assinaturas", icon: CreditCard },
  { title: "Faturamento", url: "/admin/faturamento", icon: Receipt },
  { title: "Cupons", url: "/admin/cupons", icon: Tag },
  { title: "Faturas", url: "/admin/faturas", icon: Receipt },
  { title: "Webhooks Asaas", url: "/admin/webhooks-asaas", icon: Webhook },
  { title: "Webhook Pluggy", url: "/admin/pluggy-webhook", icon: Webhook },
  { title: "Status Pluggy", url: "/admin/pluggy-status", icon: Webhook },
];

const tenantItems = [
  { title: "Clientes", url: "/admin/clientes", icon: Users },
  { title: "Cadastros", url: "/admin/cadastros", icon: UserCog },
  { title: "Categorias Padrão", url: "/admin/categorias-padrao", icon: Tag },
  { title: "Contas Contábeis Padrão", url: "/admin/contas-contabeis-padrao", icon: FileText },
  { title: "Formas de Pagamento Padrão", url: "/admin/formas-pagamento-padrao", icon: CreditCard },
  { title: "Perfis de Acesso", url: "/admin/perfis-acesso", icon: Building2 },
  { title: "Módulos", url: "/admin/modulos", icon: Sparkles },
  { title: "Bancos", url: "/admin/bancos", icon: Landmark },
  { title: "Auditoria de Saldos", url: "/admin/auditoria-saldos", icon: ShieldCheck },
  { title: "Saúde do Sistema", url: "/admin/saude-sistema", icon: Activity },
  
  { title: "Resetar Dados", url: "/admin/resetar-dados", icon: Database },
  { title: "Categorização IA", url: "/admin/categorizacao-ia", icon: Brain },
];

export function AdminSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { signOut } = useAuth();

  const renderItems = (items: typeof overviewItems) =>
    items.map((item) => (
      <SidebarMenuItem key={item.title}>
        <SidebarMenuButton asChild>
          <NavLink
            to={item.url}
            className="flex items-center gap-3 px-5 py-2.5 text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground rounded-lg mx-2 transition-all duration-200 hover:translate-x-1"
            activeClassName="bg-sidebar-accent text-sidebar-foreground font-medium translate-x-1"
          >
            <item.icon className="h-4 w-4 shrink-0" />
            <span>{item.title}</span>
          </NavLink>
        </SidebarMenuButton>
      </SidebarMenuItem>
    ));

  return (
    <Sidebar className="border-r-0" collapsible="icon">
      <SidebarHeader className="p-5 border-b border-sidebar-border mb-2">
        <div className="flex items-center justify-center gap-2">
          {collapsed ? (
            <ShieldCheck className="h-7 w-7 text-sidebar-primary" />
          ) : (
            <>
              <ShieldCheck className="h-7 w-7 text-sidebar-primary shrink-0" />
              <div className="flex items-baseline gap-1">
                <span className="text-xl font-bold tracking-tight text-sidebar-foreground">Gestor</span>
                <span className="text-xl font-bold tracking-tight text-sidebar-primary">Plin</span>
                <span className="text-[10px] uppercase tracking-widest text-sidebar-foreground/60 ml-1">
                  Admin
                </span>
              </div>
            </>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-sidebar-foreground/80 text-xs uppercase tracking-wider px-5">
            Visão geral
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>{renderItems(overviewItems)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className="text-sidebar-foreground/80 text-xs uppercase tracking-wider px-5">
            Cobrança
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>{renderItems(billingItems)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className="text-sidebar-foreground/80 text-xs uppercase tracking-wider px-5">
            Tenants
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>{renderItems(tenantItems)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-4 border-t border-sidebar-border space-y-1">
        <NavLink
          to="/"
          className="flex items-center gap-2 w-full px-3 py-2 text-sm text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent rounded-lg transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Voltar ao app</span>
        </NavLink>
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
