import { LayoutGrid, LayoutDashboard, ArrowLeftRight, Wallet, TrendingUp } from "lucide-react";
import { NavLink } from "@/components/NavLink";

const items = [
  { title: "Hub", url: "/hub", icon: LayoutGrid, end: true },
  { title: "Início", url: "/", icon: LayoutDashboard, end: true },
  { title: "Lançamentos", url: "/lancamentos", icon: ArrowLeftRight },
  { title: "Orçamento", url: "/orcamento", icon: Wallet },
  { title: "Fluxo", url: "/fluxo-caixa", icon: TrendingUp },
];

export function BottomNav() {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 border-t bg-card md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="flex items-center justify-around h-16 px-2">
        {items.map((item) => (
          <NavLink
            key={item.title}
            to={item.url}
            end={item.end}
            className="flex flex-col items-center gap-1 px-2 py-1.5 min-w-[56px] min-h-[44px] text-muted-foreground transition-colors"
            activeClassName="text-primary"
          >
            <item.icon className="h-5 w-5" />
            <span className="text-[10px] font-medium">{item.title}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
