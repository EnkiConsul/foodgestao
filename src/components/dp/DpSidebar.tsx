import { useState, useEffect } from "react";
import { NavLink, useLocation, Link, useNavigate } from "react-router-dom";
import {
  Home, Users, Briefcase, Building2, Scale, FileSignature,
  Calendar, ClipboardList, UserCheck, ArrowLeftRight, Ban,
  FileText, Coins, Clock, HeartPulse, ShieldAlert, ListChecks,
  MessageSquare, Bell, ChevronDown, LogOut, ArrowLeft, User, Repeat,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import assinatura360 from "@/assets/360food-assinatura.png.asset.json";
import symbol360 from "@/assets/360food-symbol.png.asset.json";
import { useAuth } from "@/hooks/useAuth";
import {
  Sidebar, SidebarContent, SidebarHeader, SidebarFooter,
  SidebarGroup, SidebarGroupContent, SidebarMenu, SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

type Sub = { title: string; url: string; icon: LucideIcon; end?: boolean };
type Item =
  | { kind: "link"; title: string; url: string; icon: LucideIcon; end?: boolean; home?: boolean }
  | { kind: "group"; title: string; icon: LucideIcon; prefixes: string[]; items: Sub[]; hubUrl?: string };

const ADMIN_ITEMS: Item[] = [
  { kind: "link", title: "Início", url: "/dp", icon: Home, end: true, home: true },
  {
    kind: "group", title: "Cadastro", icon: Users,
    prefixes: ["/dp/colaboradores", "/dp/cadastros"],
    hubUrl: "/dp/cadastros",
    items: [
      { title: "Colaboradores", url: "/dp/colaboradores", icon: Users },
      { title: "Cargos", url: "/dp/cadastros/cargos", icon: Briefcase },
      { title: "Unidades", url: "/dp/cadastros/unidades", icon: Building2 },
      { title: "Sindicatos", url: "/dp/cadastros/sindicatos", icon: Scale },
    ],
  },
  {
    kind: "group", title: "Folgas", icon: Calendar,
    prefixes: ["/dp/folgas", "/dp/solicitacoes", "/dp/aprovacoes", "/dp/trocas", "/dp/bloqueios"],
    items: [
      { title: "Calendário Geral", url: "/dp/folgas", icon: Calendar },
      { title: "Solicitações", url: "/dp/solicitacoes", icon: ClipboardList },
      { title: "Aprovações", url: "/dp/aprovacoes", icon: UserCheck },
      { title: "Trocas", url: "/dp/trocas", icon: ArrowLeftRight },
      { title: "Datas Bloqueadas", url: "/dp/bloqueios", icon: Ban },
    ],
  },
  {
    kind: "group", title: "Documentos", icon: FileText,
    prefixes: ["/dp/documentos", "/dp/disciplinar"],
    items: [
      { title: "Contracheques", url: "/dp/documentos/contracheque", icon: FileText },
      { title: "Adiantamentos", url: "/dp/documentos/adiantamento", icon: Coins },
      { title: "Folhas de Ponto", url: "/dp/documentos/ponto", icon: Clock },
      { title: "Atestados", url: "/dp/documentos/atestado", icon: HeartPulse },
      { title: "Registros Disciplinares", url: "/dp/disciplinar", icon: ShieldAlert },
      { title: "Negociações Coletivas (ACT/CCT)", url: "/dp/documentos/act-cct", icon: FileSignature },
      { title: "Histórico Completo", url: "/dp/documentos/historico", icon: ListChecks },
      { title: "Importar em massa", url: "/dp/documentos/importar", icon: FileText },
    ],
  },
  {
    kind: "group", title: "Comunicação", icon: MessageSquare,
    prefixes: ["/dp/comunicacao", "/dp/mensagens", "/dp/avisos", "/dp/modelos-mensagem"],
    items: [
      { title: "Central de Comunicação", url: "/dp/comunicacao", icon: MessageSquare, end: true },
      { title: "Mensagens", url: "/dp/mensagens", icon: MessageSquare },
      { title: "Quadro de Avisos", url: "/dp/avisos", icon: Bell },
      { title: "Modelos de Mensagem", url: "/dp/modelos-mensagem", icon: MessageSquare },
    ],
  },
];

const PORTAL_ITEMS: Item[] = [
  { kind: "link", title: "Início", url: "/dp/meu", icon: Home, end: true, home: true },
  { kind: "link", title: "Perfil", url: "/dp/meu/perfil", icon: User },
  { kind: "link", title: "Calendário", url: "/dp/meu/calendario", icon: Calendar },
  { kind: "link", title: "Histórico", url: "/dp/meu/historico", icon: ClipboardList },
  {
    kind: "group", title: "Folgas", icon: Calendar,
    prefixes: ["/dp/meu/solicitacoes", "/dp/meu/trocas", "/dp/meu/atestados"],
    items: [
      { title: "Solicitações", url: "/dp/meu/solicitacoes", icon: ClipboardList },
      { title: "Atestados", url: "/dp/meu/atestados", icon: HeartPulse },
      { title: "Trocas", url: "/dp/meu/trocas", icon: Repeat },
    ],
  },
  {
    kind: "group", title: "Documentos", icon: FileText,
    prefixes: ["/dp/meu/documentos", "/dp/meu/disciplinar", "/dp/meu/sindicato"],
    items: [
      { title: "Meus Documentos", url: "/dp/meu/documentos", icon: FileText },
      { title: "Disciplinar", url: "/dp/meu/disciplinar", icon: ShieldAlert },
      { title: "Meu Sindicato", url: "/dp/meu/sindicato", icon: Scale },
    ],
  },
];

export function DpSidebar({ variant = "admin" }: { variant?: "admin" | "portal" }) {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { user, signOut } = useAuth();
  const items = variant === "portal" ? PORTAL_ITEMS : ADMIN_ITEMS;
  const subtitle = variant === "portal" ? "Portal do Colaborador" : "DP 360°";

  return (
    <Sidebar collapsible="icon" className="border-r border-[hsl(var(--dp-border))] bg-white">
      <SidebarHeader className="p-4 border-b border-[hsl(var(--dp-border))] bg-white">
        <div className="flex items-center gap-2">
          <img
            src={collapsed ? symbol360.url : assinatura360.url}
            alt="360°FOOD"
            className={collapsed ? "h-8 w-auto object-contain" : "h-10 w-auto object-contain"}
            draggable={false}
          />
        </div>
        {!collapsed && (
          <p className="text-xs text-muted-foreground mt-1 ml-1">{subtitle}</p>
        )}
      </SidebarHeader>

      <SidebarContent className="bg-white px-2 py-3">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu className="gap-1">
              {items.map((it) =>
                it.kind === "link" ? (
                  <DpLink key={it.url} item={it} collapsed={collapsed} />
                ) : (
                  <DpGroup key={it.title} item={it} collapsed={collapsed} />
                ),
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-[hsl(var(--dp-border))] bg-white p-3 space-y-2">
        {variant === "admin" && !collapsed && (
          <Link
            to="/hub"
            className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Voltar ao Hub
          </Link>
        )}
        {!collapsed && user && (
          <div className="px-3 py-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-foreground truncate">
              {user.email?.split("@")[0]}
            </p>
            <p className="text-[11px] text-muted-foreground truncate">
              {variant === "portal" ? "Colaborador" : "Administrador"}
            </p>
          </div>
        )}
        <button
          onClick={signOut}
          className="flex items-center gap-2 w-full px-3 py-2 text-sm text-primary hover:bg-accent rounded-lg transition-colors font-medium"
        >
          <LogOut className="h-4 w-4" />
          {!collapsed && <span>Sair</span>}
        </button>
      </SidebarFooter>
    </Sidebar>
  );
}

function DpLink({ item, collapsed }: { item: Extract<Item, { kind: "link" }>; collapsed: boolean }) {
  return (
    <SidebarMenuItem>
      <NavLink
        to={item.url}
        end={item.end}
        className={({ isActive }) =>
          cn(
            "flex items-center gap-3 px-3 py-2.5 text-sm rounded-lg transition-colors",
            isActive
              ? item.home
                ? "bg-primary text-primary-foreground font-semibold shadow-sm"
                : "bg-primary/10 text-primary font-medium"
              : "text-foreground/70 hover:bg-accent hover:text-foreground",
          )
        }
      >
        <item.icon className="h-4 w-4 shrink-0" />
        {!collapsed && <span>{item.title}</span>}
      </NavLink>
    </SidebarMenuItem>
  );
}

function DpGroup({ item, collapsed }: { item: Extract<Item, { kind: "group" }>; collapsed: boolean }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const active = item.prefixes.some((p) => pathname.startsWith(p));
  const [open, setOpen] = useState(active);

  useEffect(() => {
    if (active) setOpen(true);
  }, [active]);

  if (collapsed) {
    return (
      <SidebarMenuItem>
        <NavLink
          to={item.hubUrl ?? item.items[0].url}
          className={cn(
            "flex items-center justify-center px-3 py-2.5 rounded-lg transition-colors",
            active ? "bg-primary/10 text-primary" : "text-foreground/70 hover:bg-accent",
          )}
        >
          <item.icon className="h-4 w-4" />
        </NavLink>
      </SidebarMenuItem>
    );
  }

  return (
    <SidebarMenuItem>
      <button
        type="button"
        onClick={() => {
          if (item.hubUrl) navigate(item.hubUrl);
          setOpen((v) => !v);
        }}
        className={cn(
          "flex items-center gap-3 w-full px-3 py-2.5 text-sm rounded-lg transition-colors",
          active
            ? "bg-primary/10 text-primary font-medium"
            : "text-foreground/70 hover:bg-accent hover:text-foreground",
        )}
      >
        <item.icon className="h-4 w-4 shrink-0" />
        <span className="flex-1 text-left">{item.title}</span>
        <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="mt-1 ml-4 pl-3 border-l border-[hsl(var(--dp-border))] space-y-0.5">
          {item.items.map((sub) => (
            <NavLink
              key={sub.url}
              to={sub.url}
              end={sub.end}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2 px-3 py-2 text-sm rounded-md transition-colors",
                  isActive
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-foreground/60 hover:bg-accent hover:text-foreground",
                )
              }
            >
              <sub.icon className="h-3.5 w-3.5 shrink-0" />
              <span>{sub.title}</span>
            </NavLink>
          ))}
        </div>
      )}
    </SidebarMenuItem>
  );
}
