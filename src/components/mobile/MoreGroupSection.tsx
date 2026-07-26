import { useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ChevronDown, ChevronRight, Star } from "lucide-react";
import type {
  GroupAccent,
  MoreGroup,
  MoreSubGroup,
  NavLeaf,
} from "@/config/mobileNav";
import { cn } from "@/lib/utils";

const ACCENT_CHIP: Record<GroupAccent, string> = {
  primary: "bg-primary/15 text-primary",
  navy: "bg-secondary text-secondary-foreground",
  amber: "bg-accent text-accent-foreground",
  slate: "bg-muted text-foreground",
  muted: "bg-muted text-muted-foreground",
};

const LONG_PRESS_MS = 550;

type Props = {
  group: MoreGroup;
  isFavorite: (to: string) => boolean;
  onToggleFav: (to: string, label: string) => void;
};

export function MoreGroupSection({ group, isFavorite, onToggleFav }: Props) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const accent = group.accent ?? "muted";

  const items = (group.items ?? []).filter((it) => it.to !== "/dp" || false);
  const subgroups = group.subgroups ?? [];

  // Grupos de módulo abrem por padrão; Conta (muted) começa fechado.
  const [open, setOpen] = useState<boolean>(accent !== "muted");

  const isActive = (to: string) =>
    pathname === to || pathname.startsWith(to + "/");

  const handleNavigate = (to: string) => navigate(to);
  const handleFav = (to: string, label: string) => onToggleFav(to, label);

  return (
    <section className="space-y-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-1 py-1 text-left"
        aria-expanded={open}
      >
        <span
          className={cn(
            "inline-flex h-7 w-7 items-center justify-center rounded-lg text-[13px] font-semibold",
            ACCENT_CHIP[accent],
          )}
          aria-hidden
        >
          {group.label.charAt(0)}
        </span>
        <h3 className="flex-1 text-sm font-semibold tracking-tight">
          {group.label}
        </h3>
        <ChevronDown
          className={cn(
            "h-4 w-4 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div className="space-y-4">
          {items.length > 0 && (
            <TileGrid
              items={items}
              accent={accent}
              isActive={isActive}
              isFavorite={isFavorite}
              onNavigate={handleNavigate}
              onToggleFav={handleFav}
            />
          )}

          {subgroups.map((sg) => (
            <SubgroupBlock
              key={sg.label}
              subgroup={sg}
              accent={accent}
              isActive={isActive}
              isFavorite={isFavorite}
              onNavigate={handleNavigate}
              onToggleFav={handleFav}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function SubgroupBlock({
  subgroup,
  accent,
  isActive,
  isFavorite,
  onNavigate,
  onToggleFav,
}: {
  subgroup: MoreSubGroup;
  accent: GroupAccent;
  isActive: (to: string) => boolean;
  isFavorite: (to: string) => boolean;
  onNavigate: (to: string) => void;
  onToggleFav: (to: string, label: string) => void;
}) {
  const SgIcon = subgroup.icon;
  return (
    <div className="rounded-2xl border bg-card p-3 space-y-3">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "inline-flex h-8 w-8 items-center justify-center rounded-lg",
            ACCENT_CHIP[accent],
          )}
        >
          <SgIcon className="h-4 w-4" />
        </span>
        <span className="flex-1 min-w-0 text-[13px] font-semibold truncate">
          {subgroup.label}
        </span>
        {subgroup.hubTo && (
          <button
            type="button"
            onClick={() => onNavigate(subgroup.hubTo!)}
            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
          >
            Ver tudo
            <ChevronRight className="h-3 w-3" />
          </button>
        )}
      </div>
      <TileGrid
        items={subgroup.items}
        accent={accent}
        isActive={isActive}
        isFavorite={isFavorite}
        onNavigate={onNavigate}
        onToggleFav={onToggleFav}
      />
    </div>
  );
}

function TileGrid({
  items,
  accent,
  isActive,
  isFavorite,
  onNavigate,
  onToggleFav,
}: {
  items: NavLeaf[];
  accent: GroupAccent;
  isActive: (to: string) => boolean;
  isFavorite: (to: string) => boolean;
  onNavigate: (to: string) => void;
  onToggleFav: (to: string, label: string) => void;
}) {
  return (
    <div className="grid grid-cols-4 gap-2">
      {items.map((item) => (
        <IFoodTile
          key={item.to}
          item={item}
          accent={accent}
          active={isActive(item.to)}
          fav={isFavorite(item.to)}
          onNavigate={() => onNavigate(item.to)}
          onToggleFav={() => onToggleFav(item.to, item.label)}
        />
      ))}
    </div>
  );
}

function useLongPress(onLongPress: () => void) {
  const timer = useRef<number | null>(null);
  const fired = useRef(false);
  return {
    fired,
    onPointerDown: () => {
      fired.current = false;
      timer.current = window.setTimeout(() => {
        fired.current = true;
        onLongPress();
      }, LONG_PRESS_MS);
    },
    cancel: () => {
      if (timer.current) {
        window.clearTimeout(timer.current);
        timer.current = null;
      }
    },
  };
}

function IFoodTile({
  item,
  accent,
  active,
  fav,
  onNavigate,
  onToggleFav,
}: {
  item: NavLeaf;
  accent: GroupAccent;
  active: boolean;
  fav: boolean;
  onNavigate: () => void;
  onToggleFav: () => void;
}) {
  const Icon = item.icon;
  const lp = useLongPress(onToggleFav);
  return (
    <button
      onPointerDown={lp.onPointerDown}
      onPointerUp={lp.cancel}
      onPointerLeave={lp.cancel}
      onPointerCancel={lp.cancel}
      onClick={() => {
        if (lp.fired.current) { lp.fired.current = false; return; }
        onNavigate();
      }}
      className={cn(
        "relative flex flex-col items-center justify-start gap-1.5 px-1 py-2 rounded-xl text-center",
        "active:scale-[0.95] transition-transform",
      )}
    >
      <span
        className={cn(
          "inline-flex h-12 w-12 items-center justify-center rounded-full",
          ACCENT_CHIP[accent],
          active && "ring-2 ring-primary/60",
        )}
      >
        <Icon className="h-5 w-5" />
      </span>
      <span className={cn(
        "block text-[11px] leading-tight line-clamp-2 min-h-[26px]",
        active ? "font-semibold text-primary" : "text-foreground/80",
      )}>
        {item.label}
      </span>
      {fav && (
        <Star className="absolute top-1 right-1 h-3 w-3 fill-primary text-primary" />
      )}
    </button>
  );
}
