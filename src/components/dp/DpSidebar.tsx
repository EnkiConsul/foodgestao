import { useState } from "react";
import { NavLink, useLocation, Link } from "react-router-dom";
import {
  Home, Users, CalendarDays, FileText, MessageSquareText, ChevronDown,
  Building2, Wallet, ShieldAlert, LogOut, ArrowLeft, User,
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

type Sub = { title: string; url: string; end?: boolean };
type Item =
  | { kind: "link"; title: string; url: string; icon: LucideIcon; end?: boolean }
  | { kind: "group"; title: string; icon: LucideIcon; prefix: string; items: Sub[] };

const ADMIN_ITEMS: Item[] = [
  { kind: "link", title: "Início", url: "/dp", icon: Home, end: true },
  {
    kind: "group", title: "Cadastro", icon: Users, prefix: "/dp/cadastros",
    items: [
      { title: "Colaboradores", url: "/dp/colaboradores" },
      { title: "Unidades", url: "/dp/cadastros/unidades" },
      { title: "Cargos", url: "/dp/cadastros/cargos" },
      { title: "Sindicatos", url: "/dp/cadastros/sindicatos" },
      { title: "Negociações", url: "/dp/sindicatos/negociacoes" },
    ],
  },
  {
    kind: "group", title: "Operação", icon: CalendarDays, prefix: "/dp/folgas|/dp/trocas|/dp/solicitacoes|/dp/aprovacoes",
    items: [
      { title: "Folgas", url: "/dp/folgas" },
      { title: "Trocas", url: "/dp/trocas" },
      { title: "Solicitações", url: "/dp/solicitacoes" },
      { title: "Aprovações", url: "/dp/aprovacoes" },
    ],
  },
  {
    kind: "group", title: "Compliance", icon: ShieldAlert, prefix: "/dp/disciplinar|/dp/bloqueios|/dp/documentos",
    items: [
      { title: "Disciplinar", url: "/dp/disciplinar" },
      { title: "Bloqueios", url: "/dp/bloqueios" },
      { title: "Documentos", url: "/dp/documentos" },
    ],
  },
  {
    kind: "group", title: "Folha", icon: Wallet, prefix: "/dp/folha",
    items: [
      { title: "Períodos", url: "/dp/folha", end: true },
      { title: "Aprovações Financeiro", url: "/dp/folha/aprovacoes" },
    ],
  },
  {
    kind: "group", title: "Comunicação", icon: MessageSquareText, prefix: "/dp/avisos|/dp/mensagens",
    items: [
      { title: "Avisos", url: "/dp/avisos" },
      { title: "Mensagens", url: "/dp/mensagens" },
    ],
  },
];

const PORTAL_ITEMS: Item[] = [
  { kind: "link", title: "Início", url: "/dp/meu", icon: Home, end: true },
  { kind: "link", title: "Meus dados", url: "/dp/meu/perfil", icon: User },
  { kind: "link", title: "Documentos", url: "/dp/meu/documentos", icon: FileText },
  { kind: "link", title: "Solicitações", url: "/dp/meu/solicitacoes", icon: CalendarDays },
  { kind: "link", title: "Trocas", url: "/dp/meu/trocas", icon: Users },
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
              ? "bg-primary text-primary-foreground font-medium shadow-sm"
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
  const prefixes = item.prefix.split("|");
  const active = prefixes.some((p) => pathname.startsWith(p));
  const [open, setOpen] = useState(active);

  if (collapsed) {
    return (
      <SidebarMenuItem>
        <NavLink
          to={item.items[0].url}
          className={cn(
            "flex items-center justify-center px-3 py-2.5 rounded-lg transition-colors",
            active ? "bg-primary text-primary-foreground" : "text-foreground/70 hover:bg-accent",
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
        onClick={() => setOpen((v) => !v)}
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
                  "block px-3 py-2 text-sm rounded-md transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground font-medium"
                    : "text-foreground/60 hover:bg-accent hover:text-foreground",
                )
              }
            >
              {sub.title}
            </NavLink>
          ))}
        </div>
      )}
    </SidebarMenuItem>
  );
}
