import { useState } from "react";
import {
  LayoutDashboard,
  ArrowLeftRight,
  Wallet,
  TrendingUp,
  MoreHorizontal,
  Building2,
  Landmark,
  CreditCard,
  Users,
  FolderTree,
  UserCog,
  Sparkles,
  Receipt,
  Settings,
  Bot,
  FileBarChart,
  Shield,
  LogOut,
  MessageCircle,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { NavLink as RouterLink } from "react-router-dom";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useAuth } from "@/hooks/useAuth";
import { useSuperAdmin } from "@/hooks/useSuperAdmin";

const primaryItems = [
  { title: "Início", url: "/", icon: LayoutDashboard },
  { title: "Lançamentos", url: "/lancamentos", icon: ArrowLeftRight },
  { title: "Orçamento", url: "/orcamento", icon: Wallet },
  { title: "Fluxo", url: "/fluxo-caixa", icon: TrendingUp },
];

const moreSections = [
  {
    label: "Financeiro",
    items: [
      { title: "Relatórios", url: "/relatorios", icon: FileBarChart },
      { title: "DRE Contábil", url: "/relatorios/dre", icon: Receipt },
      { title: "Plin IA", url: "/plin-ia", icon: Bot },
    ],
  },
  {
    label: "Cadastros",
    items: [
      { title: "Perfis de Acesso", url: "/empresas", icon: Building2 },
      { title: "Contas Bancárias", url: "/contas-bancarias", icon: Landmark },
      { title: "Formas de Pagamento", url: "/formas-pagamento", icon: CreditCard },
      { title: "Clientes / Fornecedores", url: "/contatos", icon: Users },
      { title: "Categorias", url: "/categorias", icon: FolderTree },
    ],
  },
  {
    label: "Cobrança",
    items: [
      { title: "Meu Plano", url: "/planos", icon: Sparkles },
      { title: "Minhas Faturas", url: "/faturas", icon: Receipt },
    ],
  },
  {
    label: "Configurações",
    items: [
      { title: "Usuários", url: "/gestao-usuarios", icon: UserCog },
      { title: "Configurações", url: "/configuracoes", icon: Settings },
    ],
  },
];

export function BottomNav() {
  const [moreOpen, setMoreOpen] = useState(false);
  const { signOut } = useAuth();
  const { isSuperAdmin } = useSuperAdmin();

  const sections = isSuperAdmin
    ? [
        ...moreSections,
        {
          label: "Administração",
          items: [{ title: "Backoffice", url: "/admin", icon: Shield }],
        },
      ]
    : moreSections;

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 border-t bg-card md:hidden pb-safe"
      aria-label="Navegação principal"
    >
      <div className="flex items-center justify-around h-16 px-2">
        {primaryItems.map((item) => (
          <NavLink
            key={item.title}
            to={item.url}
            end={item.url === "/"}
            className="flex flex-col items-center gap-1 px-2 py-1.5 min-w-11 min-h-11 justify-center text-muted-foreground transition-colors rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            activeClassName="text-primary"
            aria-label={item.title}
          >
            <item.icon className="h-5 w-5" aria-hidden="true" />
            <span className="text-[10px] font-medium">{item.title}</span>
          </NavLink>
        ))}

        <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
          <SheetTrigger asChild>
            <button
              type="button"
              className="flex flex-col items-center gap-1 px-2 py-1.5 min-w-11 min-h-11 justify-center text-muted-foreground transition-colors rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Abrir mais opções"
            >
              <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
              <span className="text-[10px] font-medium">Mais</span>
            </button>
          </SheetTrigger>
          <SheetContent
            side="right"
            className="w-[85vw] max-w-sm p-0 flex flex-col"
          >
            <SheetHeader className="px-4 py-4 border-b">
              <SheetTitle>Mais opções</SheetTitle>
            </SheetHeader>
            <div className="flex-1 overflow-y-auto py-2">
              {sections.map((section) => (
                <div key={section.label} className="py-2">
                  <p className="px-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                    {section.label}
                  </p>
                  <ul>
                    {section.items.map((item) => (
                      <li key={item.title}>
                        <RouterLink
                          to={item.url}
                          onClick={() => setMoreOpen(false)}
                          className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-muted transition-colors"
                        >
                          <item.icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                          <span>{item.title}</span>
                        </RouterLink>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              <div className="border-t mt-2 pt-2">
                <a
                  href="https://wa.me/5562992365959"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 px-4 py-3 text-sm text-muted-foreground hover:bg-muted transition-colors"
                >
                  <MessageCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>Suporte</span>
                </a>
                <button
                  type="button"
                  onClick={() => {
                    setMoreOpen(false);
                    signOut();
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm text-muted-foreground hover:bg-muted transition-colors"
                >
                  <LogOut className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>Sair</span>
                </button>
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </nav>
  );
}
