import { useMemo } from "react";
import { NavigationCard } from "@/components/dp/NavigationCard";
import { DP_ADMIN_NAV, type DpNavItem } from "@/config/dpNavigation";
import { DP_SCREEN_DESCRIPTIONS } from "@/config/dpScreenDescriptions";
import { useHiddenScreens } from "@/hooks/useHiddenScreens";
import { filterSurface } from "@/lib/nav/hiddenScreens";
import { applyMenuLayout } from "@/lib/dp/menuLayout";
import { useDpMenuLayout } from "@/hooks/useDpMenuLayout";

/** Cards das telas de um menu do Pessoas 360°, na mesma ordem do menu. */
export function useDpGroupItems(groupId: string): DpNavItem[] {
  const { hidden } = useHiddenScreens();
  const { layout } = useDpMenuLayout("dp");
  return useMemo(() => {
    const base = filterSurface(DP_ADMIN_NAV, hidden);
    const surface = layout ? applyMenuLayout(base, layout) : base;
    return surface.groups.find((g) => g.id === groupId)?.items ?? [];
  }, [groupId, hidden, layout]);
}

interface DpGroupCardsProps {
  groupId: string;
  /** Cards extras da seção (telas que não estão no menu). */
  extras?: { label: string; to: string; icon: DpNavItem["icon"]; description?: string }[];
}

export function DpGroupCards({ groupId, extras = [] }: DpGroupCardsProps) {
  const items = useDpGroupItems(groupId);
  const cards = [
    ...items.map((i) => ({
      label: i.label,
      to: i.to,
      icon: i.icon,
      description: DP_SCREEN_DESCRIPTIONS[i.to],
    })),
    ...extras.map((e) => ({ ...e, description: e.description ?? DP_SCREEN_DESCRIPTIONS[e.to] })),
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {cards.map((c) => (
        <NavigationCard key={c.to} title={c.label} description={c.description} to={c.to} icon={c.icon} />
      ))}
    </div>
  );
}
