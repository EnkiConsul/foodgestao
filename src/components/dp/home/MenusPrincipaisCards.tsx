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
    <div className="grid grid-cols-4 gap-2">
      {grupos.map((g) => (
        <Link
          key={g.id}
          to={g.hubTo ?? g.items[0]?.to ?? "/dp"}
          className="flex flex-col items-center gap-1.5 rounded-xl p-2 active:scale-[0.96] transition-transform"
        >
          <span className="h-10 w-10 shrink-0 rounded-xl bg-primary/10 flex items-center justify-center">
            <g.icon className="h-5 w-5 text-primary" />
          </span>
          <span className="text-[11px] font-medium text-center leading-tight line-clamp-2">{g.label}</span>
        </Link>
      ))}
    </div>
  );
}
