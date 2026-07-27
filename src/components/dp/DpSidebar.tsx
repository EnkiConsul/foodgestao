import { useState, useEffect } from "react";
import { NavLink, useLocation, Link, useNavigate } from "react-router-dom";
import {
  Home, Users, Briefcase, Building2, Scale, FileSignature,
  Calendar, CalendarRange,
  CalendarClock, ClipboardList, UserCheck, ArrowLeftRight, Ban, Palmtree, ShieldCheck, Gift, BarChart3,
  FileText, Coins, Clock, HeartPulse, ShieldAlert, ListChecks,
  MessageSquare, Bell, BellRing, ChevronDown, LogOut, ArrowLeft, Settings, Repeat,
  Fingerprint, Calculator,
} from "lucide-react";
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
import { cn } from "@/lib/utils";
import { toTitleCase } from "@/lib/titleCase";

type Sub = { title: string; url: string; icon: LucideIcon; end?: boolean };
type Item =
  | { kind: "link"; title: string; url: string; icon: LucideIcon; end?: boolean; home?: boolean }
  | { kind: "group"; title: string; icon: LucideIcon; prefixes: string[]; items: Sub[]; hubUrl?: string }
  | { kind: "static-group"; title: string; icon: LucideIcon; items: Sub[] };

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
      { title: "Turnos", url: "/dp/cadastros/turnos", icon: Clock },
      { title: "Jornadas e escalas", url: "/dp/cadastros/jornadas", icon: Clock },
      
      { title: "Pendências", url: "/dp/cadastros/pendencias", icon: BellRing },
    ],
  },
  {
    kind: "group", title: "Folgas", icon: Calendar,
    prefixes: ["/dp/folgas", "/dp/solicitacoes", "/dp/aprovacoes", "/dp/trocas", "/dp/bloqueios", "/dp/ferias", "/dp/operacao", "/dp/convocacoes", "/dp/ponto", "/dp/folha", "/dp/conformidade-dsr", "/dp/escalas"],
    hubUrl: "/dp/folgas",
    items: [
      { title: "Calendário Geral", url: "/dp/folgas/calendario", icon: Calendar },
      { title: "Solicitações", url: "/dp/solicitacoes", icon: ClipboardList },
      { title: "Aprovações", url: "/dp/aprovacoes", icon: UserCheck },
      { title: "Trocas", url: "/dp/trocas", icon: ArrowLeftRight },
      { title: "Datas Bloqueadas", url: "/dp/bloqueios", icon: Ban },
      { title: "Férias", url: "/dp/ferias", icon: Palmtree },
      { title: "Escala do Mês", url: "/dp/escalas/mes", icon: CalendarRange },
      { title: "Operação do Dia", url: "/dp/operacao", icon: CalendarClock },
      { title: "Convocações", url: "/dp/convocacoes", icon: BellRing },
      { title: "Espelho de Ponto", url: "/dp/ponto", icon: Fingerprint },
      { title: "Ponto do Time", url: "/dp/ponto/time", icon: Users },
      { title: "Apuração para Folha", url: "/dp/ponto/apuracao", icon: Calculator },
      { title: "Folha de Pagamento", url: "/dp/folha", icon: Receipt },
      { title: "Gerador de Escala", url: "/dp/escalas", icon: CalendarRange },
      { title: "Conformidade DSR", url: "/dp/conformidade-dsr", icon: Scale },
      { title: "Regras De Folgas", url: "/dp/folgas/configuracoes/regras", icon: Settings },
    ],
  },
  {
    kind: "group", title: "Documentos", icon: FileText,
    prefixes: ["/dp/documentos", "/dp/disciplinar", "/dp/atestados"],
    hubUrl: "/dp/documentos",
    items: [
      { title: "Contracheques", url: "/dp/documentos/contracheque", icon: FileText },
      { title: "Adiantamentos", url: "/dp/documentos/adiantamento", icon: Coins },
      { title: "Folhas de Ponto", url: "/dp/documentos/ponto", icon: Clock },
      // Corrigido: rota real é /dp/atestados (não /dp/documentos/atestado).
      { title: "Atestados", url: "/dp/atestados", icon: HeartPulse },
      { title: "Registros Disciplinares", url: "/dp/disciplinar", icon: ShieldAlert },
      { title: "ACT-CCT", url: "/dp/documentos/act-cct", icon: FileSignature },
      { title: "Histórico Completo", url: "/dp/documentos/historico", icon: ListChecks },
    ],
  },
  { kind: "link", title: "Conformidade", url: "/dp/conformidade", icon: ShieldCheck },
  { kind: "link", title: "Benefícios", url: "/dp/beneficios", icon: Gift },
  { kind: "link", title: "Analytics de RH", url: "/dp/analytics", icon: BarChart3 },
  {
    kind: "group", title: "Comunicação", icon: MessageSquare,
    prefixes: ["/dp/comunicacao", "/dp/mensagens", "/dp/avisos"],
    hubUrl: "/dp/comunicacao",
    items: [
      { title: "Mensagens", url: "/dp/mensagens", icon: MessageSquare },
      { title: "Quadro de Avisos", url: "/dp/avisos", icon: Bell },
    ],
  },
];

// Portal do colaborador — ordem/agrupamento alinhados à documentação do
// repositório de referência (pakere1996/portalcolaborador):
//   Meu Cadastro → Folgas (Calendário, Trocas, Histórico)
//   → Documentos (Meus Documentos, Atestados, Disciplinar, Sindicato)
// Grupos estáticos (não colapsáveis) como no AppShell da referência.
const PORTAL_ITEMS: Item[] = [
  { kind: "link", title: "Início", url: "/dp/meu", icon: Home, end: true, home: true },
  { kind: "link", title: "Mural", url: "/dp/meu/mural", icon: Bell },
  { kind: "link", title: "Meu Cadastro", url: "/dp/meu/perfil", icon: Settings },
  {
    kind: "static-group", title: "Folgas", icon: Calendar,
    items: [
      { title: "Calendário", url: "/dp/meu/calendario", icon: Calendar },
      { title: "Trocas", url: "/dp/meu/trocas", icon: Repeat },
      { title: "Histórico", url: "/dp/meu/historico", icon: ClipboardList },
      // Extra do 360°FOOD (não existe na doc, preservado como último item):
      { title: "Solicitações", url: "/dp/meu/solicitacoes", icon: ClipboardList },
    ],
  },
  {
    kind: "static-group", title: "Documentos", icon: FileText,
    items: [
      { title: "Meus Documentos", url: "/dp/meu/documentos", icon: FileText },
      { title: "Atestados", url: "/dp/meu/atestados", icon: HeartPulse },
      { title: "Disciplinar", url: "/dp/meu/disciplinar", icon: ShieldAlert },
      { title: "Sindicato", url: "/dp/meu/sindicato", icon: Scale },
    ],
  },
];

export function DpSidebar({ variant = "admin" }: { variant?: "admin" | "portal" }) {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { user, signOut } = useAuth();
  const meuResumo = useDpMeuResumo();
  const items = variant === "portal" ? PORTAL_ITEMS : ADMIN_ITEMS;
  const subtitle = variant === "portal" ? "Portal do Colaborador" : "DP 360°";

  // Toggle exclusivo para grupos do admin (apenas 1 grupo aberto por vez).
  const [openGroup, setOpenGroup] = useState<string | null>(null);

  const displayName =
    meuResumo?.nome ?? user?.email?.split("@")[0] ?? "—";
  const displayRole =
    meuResumo?.cargo ??
    (variant === "portal" ? "Colaborador" : "Administrador");

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
              {items.map((it) => {
                if (it.kind === "link") {
                  return <DpLink key={it.url} item={it} collapsed={collapsed} />;
                }
                if (it.kind === "static-group") {
                  return <DpStaticGroup key={it.title} item={it} collapsed={collapsed} />;
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
  const active = item.prefixes.some((p) => pathname.startsWith(p));

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
              <span>{toTitleCase(sub.title)}</span>
            </NavLink>
          ))}
        </div>
      )}
    </SidebarMenuItem>
  );
}

// Grupo estático (não colapsável) — usado no portal do colaborador para
// reproduzir o comportamento do AppShell da documentação de referência,
// onde o rótulo do grupo é apenas um cabeçalho e todos os subitens ficam
// sempre visíveis.
function DpStaticGroup({
  item,
  collapsed,
}: {
  item: Extract<Item, { kind: "static-group" }>;
  collapsed: boolean;
}) {
  if (collapsed) {
    return (
      <>
        {item.items.map((sub) => (
          <SidebarMenuItem key={sub.url}>
            <NavLink
              to={sub.url}
              end={sub.end}
              aria-label={sub.title}
              className={({ isActive }) =>
                cn(
                  "flex items-center justify-center px-3 py-2.5 rounded-lg transition-colors",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-foreground/70 hover:bg-accent",
                )
              }
            >
              <sub.icon className="h-4 w-4" />
            </NavLink>
          </SidebarMenuItem>
        ))}
      </>
    );
  }

  return (
    <SidebarMenuItem>
      <div className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-semibold text-muted-foreground">
        <item.icon className="h-4 w-4 shrink-0" />
        <span>{toTitleCase(item.title)}</span>
      </div>
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
            <span>{toTitleCase(sub.title)}</span>
          </NavLink>
        ))}
      </div>
    </SidebarMenuItem>
  );
}
