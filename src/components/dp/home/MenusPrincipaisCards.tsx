import { useMemo } from "react";
import { Link } from "react-router-dom";
import { DP_ADMIN_NAV } from "@/config/dpNavigation";
import { applyMenuLayout } from "@/lib/dp/menuLayout";
import { useDpMenuLayout } from "@/hooks/useDpMenuLayout";
import { useHiddenScreens } from "@/hooks/useHiddenScreens";
import { filterSurface } from "@/lib/nav/hiddenScreens";

/**
 * Atalhos para os menus principais do Pessoas 360° — primeiros itens do
 * Início no celular, na mesma ordem do menu do usuário.
 */
export function MenusPrincipaisCards() {
  const { hidden } = useHiddenScreens();
  const { layout } = useDpMenuLayout("dp");
  const grupos = useMemo(() => {
    const base = filterSurface(DP_ADMIN_NAV, hidden);
    return (layout ? applyMenuLayout(base, layout) : base).groups;
  }, [hidden, layout]);

  return (
    <div className="grid grid-cols-2 gap-3">
      {grupos.map((g) => (
        <Link
          key={g.id}
          to={g.hubTo ?? g.items[0]?.to ?? "/dp"}
          className="flex items-center gap-3 rounded-2xl border-2 border-[hsl(var(--dp-border))] bg-card p-4 active:scale-[0.98] transition-transform"
        >
          <span className="h-9 w-9 shrink-0 rounded-lg bg-primary/10 flex items-center justify-center">
            <g.icon className="h-5 w-5 text-primary" />
          </span>
          <span className="text-sm font-semibold truncate">{g.label}</span>
        </Link>
      ))}
    </div>
  );
}
