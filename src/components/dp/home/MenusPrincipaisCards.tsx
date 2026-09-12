import { useMemo } from "react";
import { Link } from "react-router-dom";
import { DP_ADMIN_NAV } from "@/config/dpNavigation";
import { applyMenuLayout } from "@/lib/dp/menuLayout";
import { useDpMenuLayout } from "@/hooks/useDpMenuLayout";
import { useHiddenScreens } from "@/hooks/useHiddenScreens";
import { useDpUserPrefs } from "@/hooks/useDpUserPrefs";
import { filterSurface } from "@/lib/nav/hiddenScreens";
import { cn } from "@/lib/utils";

const FORMATOS = [5, 4, 3] as const;
type Cols = (typeof FORMATOS)[number];

/**
 * Atalhos para os menus principais do Pessoas 360° — primeiros itens do
 * Início no celular, na mesma ordem do menu do usuário. O usuário escolhe
 * quantos ícones por linha (5, 4 ou 3); a escolha fica salva nas
 * preferências por usuário/empresa.
 */
export function MenusPrincipaisCards() {
  const { hidden } = useHiddenScreens();
  const { layout } = useDpMenuLayout("dp");
  const { prefs, save } = useDpUserPrefs();
  const cols = ((): Cols => {
    const v = (prefs?.extras as any)?.home_atalhos_cols;
    return FORMATOS.includes(v) ? (v as Cols) : 5;
  })();

  const grupos = useMemo(() => {
    const base = filterSurface(DP_ADMIN_NAV, hidden);
    return (layout ? applyMenuLayout(base, layout) : base).groups;
  }, [hidden, layout]);

  const densidade =
    cols === 5
      ? { icon: "h-8 w-8", iconSize: "h-4 w-4", label: "text-[10px]", gap: "gap-1" }
      : cols === 4
        ? { icon: "h-10 w-10", iconSize: "h-5 w-5", label: "text-[11px]", gap: "gap-1.5" }
        : { icon: "h-11 w-11", iconSize: "h-5 w-5", label: "text-xs", gap: "gap-2" };

  return (
    <div>
      <div className="flex justify-end mb-1">
        <div className="flex items-center gap-0.5 rounded-full bg-muted/60 p-0.5" role="group" aria-label="Ícones por linha">
          {FORMATOS.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() =>
                save({ extras: { ...(prefs?.extras ?? {}), home_atalhos_cols: n } })
              }
              className={cn(
                "h-5 w-6 rounded-full text-[10px] font-medium transition-colors",
                cols === n ? "bg-primary text-primary-foreground" : "text-muted-foreground",
              )}
              aria-pressed={cols === n}
              title={`${n} ícones por linha`}
            >
              {n}
            </button>
          ))}
        </div>
      </div>
      <div className={cn("grid gap-1.5", cols === 5 ? "grid-cols-5" : cols === 4 ? "grid-cols-4" : "grid-cols-3")}>
        {grupos.map((g) => (
          <Link
            key={g.id}
            to={g.hubTo ?? g.items[0]?.to ?? "/dp"}
            className={cn("flex flex-col items-center rounded-xl py-1.5 px-1 active:scale-[0.96] transition-transform", densidade.gap)}
          >
            <span className={cn("shrink-0 rounded-lg bg-primary/10 flex items-center justify-center", densidade.icon)}>
              <g.icon className={cn("text-primary", densidade.iconSize)} />
            </span>
            <span className={cn("font-medium text-center leading-tight line-clamp-2", densidade.label)}>{g.label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
