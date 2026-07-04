import { LayoutDashboard, ArrowLeftRight, Wallet, TrendingUp, Settings } from "lucide-react";
import { NavLink } from "@/components/NavLink";

const items = [
  { title: "Início", url: "/", icon: LayoutDashboard },
  { title: "Lançamentos", url: "/lancamentos", icon: ArrowLeftRight },
  { title: "Orçamento", url: "/orcamento", icon: Wallet },
  { title: "Fluxo", url: "/fluxo-caixa", icon: TrendingUp },
  { title: "Mais", url: "/configuracoes", icon: Settings },
];

export function BottomNav() {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 border-t bg-card md:hidden pb-safe"
      aria-label="Navegação principal"
    >
      <div className="flex items-center justify-around h-16 px-2">
        {items.map((item) => (
          <NavLink
            key={item.title}
            to={item.url}
            end={item.url === "/"}
            className="flex flex-col items-center gap-1 px-3 py-1.5 min-w-11 min-h-11 justify-center text-muted-foreground transition-colors rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            activeClassName="text-primary"
            aria-label={item.title}
          >
            <item.icon className="h-5 w-5" aria-hidden="true" />
            <span className="text-[10px] font-medium">{item.title}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
