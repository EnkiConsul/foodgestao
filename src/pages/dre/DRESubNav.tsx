import { Link, useLocation } from "react-router-dom";
import { Settings2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface SubNavItem {
  to: string;
  label: string;
  exact?: boolean;
  icon?: LucideIcon;
}

const ITEMS: SubNavItem[] = [
  { to: "/relatorios/dre", label: "Relatório", exact: true },
  { to: "/relatorios/dre/configuracao", label: "Mapeamento", icon: Settings2 },
  { to: "/relatorios/dre/rubricas", label: "Rubricas" },
  { to: "/relatorios/dre/comparativo", label: "Comparativo" },
  { to: "/relatorios/dre/historico", label: "Histórico" },
];

export function DRESubNav() {
  const { pathname } = useLocation();
  return (
    <nav
      aria-label="Sub-navegação da DRE"
      className="flex gap-1 overflow-x-auto border-b -mx-2 px-2 sm:mx-0 sm:px-0"
    >
      {ITEMS.map((it) => {
        const active = it.exact ? pathname === it.to : pathname.startsWith(it.to);
        const Icon = it.icon;
        return (
          <Link
            key={it.to}
            to={it.to}
            aria-current={active ? "page" : undefined}
            className={
              "inline-flex items-center gap-1.5 whitespace-nowrap px-3 py-2 text-sm font-medium border-b-2 transition-colors -mb-px " +
              (active
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-border")
            }
          >
            {Icon && <Icon className="h-3.5 w-3.5" aria-hidden="true" />}
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}
