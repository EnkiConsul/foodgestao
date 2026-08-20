import { useMemo, useState, useEffect } from "react";
import { NavLink, useLocation, Link, useNavigate } from "react-router-dom";
import { ChevronDown, LogOut, ArrowLeft, ListOrdered } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import assinatura360 from "@/assets/360food-assinatura.png.asset.json";
import symbol360 from "@/assets/360food-symbol.png.asset.json";
import { useAuth } from "@/hooks/useAuth";
import { useDpMeuResumo } from "@/hooks/useDpMeuResumo";
import {
  Sidebar, SidebarContent, SidebarHeader, SidebarFooter,
  SidebarGroup, SidebarGroupContent, SidebarMenu, SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { SidebarToggleButton } from "@/components/layout/SidebarToggleButton";
import { cn } from "@/lib/utils";
import { toTitleCase } from "@/lib/titleCase";
import {
  DP_ADMIN_NAV,
  DP_PORTAL_NAV,
  surfaceRoutes,
  type DpNavGroup,
  type DpNavItem,
  type DpNavSurface,
} from "@/config/dpNavigation";
import { makeIsActive } from "@/lib/nav-active";
import { applyMenuLayout } from "@/lib/dp/menuLayout";
import { useDpMenuLayout } from "@/hooks/useDpMenuLayout";
import { useHiddenScreens } from "@/hooks/useHiddenScreens";
import { filterSurface } from "@/lib/nav/hiddenScreens";
import { OrganizarMenuDialog } from "@/components/dp/OrganizarMenuDialog";



type Sub = { title: string; url: string; icon: LucideIcon; end?: boolean; badge?: string };
type Item =
  | { kind: "link"; title: string; url: string; icon: LucideIcon; end?: boolean; home?: boolean }
  | { kind: "group"; title: string; icon: LucideIcon; prefixes: string[]; items: Sub[]; hubUrl?: string };

/**
 * Sidebar e menu "Mais" (mobile) compartilham a mesma fonte de verdade:
 * `src/config/dpNavigation.tsx`.
 */
function toSub(item: DpNavItem): Sub {
  return { title: item.label, url: item.to, icon: item.icon, end: item.end, badge: item.badge };
}


function toGroup(group: DpNavGroup): Item {
  return {
    kind: "group",
    title: group.label,
    icon: group.icon,
    prefixes: group.matchPrefixes,
    hubUrl: group.hubTo,
    items: group.items.map(toSub),
  };
}

function buildItems(surface: DpNavSurface): Item[] {
  return [
    {
      kind: "link",
      title: surface.home.label,
      url: surface.home.to,
      icon: surface.home.icon,
      end: true,
      home: true,
    },
    ...surface.groups.map(toGroup),
    ...surface.direct.map((i) => ({
      kind: "link" as const,
      title: i.label,
      url: i.to,
      icon: i.icon,
      end: i.end,
    })),
  ];
}

const ADMIN_ITEMS: Item[] = buildItems(DP_ADMIN_NAV);
const PORTAL_ITEMS: Item[] = buildItems(DP_PORTAL_NAV);

const ADMIN_ROUTES = surfaceRoutes(DP_ADMIN_NAV);
const PORTAL_ROUTES = surfaceRoutes(DP_PORTAL_NAV);

/**
 * Ativo por especificidade: apenas a rota mais longa que casa com o pathname
 * fica marcada (ex.: em /dp/ponto/time, "Espelho de Ponto" não acende).
 */
function useDpIsActive() {
  const { pathname } = useLocation();
  const routes = pathname.startsWith("/dp/meu") ? PORTAL_ROUTES : ADMIN_ROUTES;
  return makeIsActive(pathname, routes);
}


export function DpSidebar({ variant = "admin" }: { variant?: "admin" | "portal" }) {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { user, signOut } = useAuth();
  const meuResumo = useDpMeuResumo();
  const surfaceKey = variant === "portal" ? "portal" : "dp";
  const { layout } = useDpMenuLayout(surfaceKey);
  const { hidden } = useHiddenScreens();
  const [organizarOpen, setOrganizarOpen] = useState(false);
  const items = useMemo(() => {
    const base = filterSurface(variant === "portal" ? DP_PORTAL_NAV : DP_ADMIN_NAV, hidden);
    return buildItems(layout ? applyMenuLayout(base, layout) : base);
  }, [variant, layout, hidden]);

  const subtitle = variant === "portal" ? "Portal do Colaborador" : "Pessoas 360°";

  // Toggle exclusivo para grupos do admin (apenas 1 grupo aberto por vez).
  const [openGroup, setOpenGroup] = useState<string | null>(null);

  const displayName =
    meuResumo?.nome ?? user?.email?.split("@")[0] ?? "—";
  const displayRole =
    meuResumo?.cargo ??
    (variant === "portal" ? "Colaborador" : "Administrador");

  return (
    <Sidebar collapsible="icon" className="border-r border-[hsl(var(--dp-border))] bg-white">
      <SidebarHeader className={cn("border-b border-[hsl(var(--dp-border))] bg-white", collapsed ? "px-1 py-2" : "p-4")}>
        <div className={cn("flex w-full", collapsed ? "flex-col items-center justify-center gap-1" : "flex-row items-center justify-between gap-2")}>
          <img
            src={collapsed ? symbol360.url : assinatura360.url}
            alt="360°FOOD"
            className={cn("object-contain", collapsed ? "h-6 w-auto max-w-full" : "h-10 w-auto")}
            draggable={false}
          />
          <SidebarToggleButton className={collapsed ? "h-6 w-6 p-1" : "h-7 w-7 p-0"} />
        </div>
        {!collapsed && (
          <p className="text-xs text-muted-foreground mt-1 ml-1">{subtitle}</p>
        )}
      </SidebarHeader>


      <SidebarContent className="bg-white px-2 py-3">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu className="gap-1">
              {items.map((it) => {
                if (it.kind === "link") {
                  return <DpLink key={it.url} item={it} collapsed={collapsed} />;
                }
                return (
                  <DpGroup
                    key={it.title}
                    item={it}
                    collapsed={collapsed}
                    isOpen={openGroup === it.title}
                    onOpen={(next) => setOpenGroup(next ? it.title : null)}
                  />
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-[hsl(var(--dp-border))] bg-white p-3 space-y-2">
        {!collapsed && (
          <button
            type="button"
            onClick={() => setOrganizarOpen(true)}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ListOrdered className="h-3.5 w-3.5" />
            Organizar menu
          </button>
        )}
        <OrganizarMenuDialog
          open={organizarOpen}
          onOpenChange={setOrganizarOpen}
          surface={surfaceKey}
        />
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
              {displayName}
            </p>
            <p className="text-[11px] text-muted-foreground truncate">
              {displayRole}
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
  const isActiveRoute = useDpIsActive();
  const isActive = isActiveRoute(item.url);
  return (
    <SidebarMenuItem>
      <NavLink
        to={item.url}
        end={item.end}
        className={
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
        {!collapsed && <span>{toTitleCase(item.title)}</span>}
      </NavLink>
    </SidebarMenuItem>
  );
}

function DpGroup({
  item,
  collapsed,
  isOpen,
  onOpen,
}: {
  item: Extract<Item, { kind: "group" }>;
  collapsed: boolean;
  isOpen: boolean;
  onOpen: (next: boolean) => void;
}) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const isActiveRoute = useDpIsActive();
  const active =
    item.prefixes.some((p) => pathname === p || pathname.startsWith(p + "/")) ||
    item.items.some((sub) => isActiveRoute(sub.url));

  // Abre automaticamente o grupo cujo prefixo corresponde à rota atual.
  useEffect(() => {
    if (active) onOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
          aria-label={item.title}
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
          onOpen(!isOpen);
        }}
        aria-expanded={isOpen}
        aria-label={isOpen ? `Fechar menu ${item.title}` : `Abrir menu ${item.title}`}
        className={cn(
          "flex items-center gap-3 w-full px-3 py-2.5 text-sm rounded-lg transition-colors",
          active
            ? "bg-primary/10 text-primary font-medium"
            : "text-foreground/70 hover:bg-accent hover:text-foreground",
        )}
      >
        <item.icon className="h-4 w-4 shrink-0" />
        <span className="flex-1 text-left">{toTitleCase(item.title)}</span>
        <ChevronDown className={cn("h-4 w-4 transition-transform", isOpen && "rotate-180")} />
      </button>
      {isOpen && (
        <div className="mt-1 ml-4 pl-3 border-l border-[hsl(var(--dp-border))] space-y-0.5">
          {item.items.map((sub) => (
            <NavLink
              key={sub.url}
              to={sub.url}
              end={sub.end}
              className={
                cn(
                  "flex items-center gap-2 px-3 py-2 text-sm rounded-md transition-colors",
                  isActiveRoute(sub.url)
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-foreground/60 hover:bg-accent hover:text-foreground",
                )
              }
            >
              <sub.icon className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{toTitleCase(sub.title)}</span>
              {sub.badge && (
                <span
                  title={sub.badge}
                  aria-label={sub.badge}
                  className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/50"
                />
              )}


            </NavLink>
          ))}
        </div>
      )}
    </SidebarMenuItem>
  );
}

