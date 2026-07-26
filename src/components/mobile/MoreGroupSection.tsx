import { useMemo, useRef, useState } from "react";
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

  const items = group.items ?? [];
  const subgroups = group.subgroups ?? [];

  const featured = items.filter((i) => i.featured);
  const rest = items.filter((i) => !i.featured);

  const isActive = (to: string) =>
    pathname === to || pathname.startsWith(to + "/");

  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2 px-1">
        <span
          className={cn(
            "inline-flex h-7 w-7 items-center justify-center rounded-lg text-[13px] font-semibold",
            ACCENT_CHIP[accent],
          )}
          aria-hidden
        >
          {group.label.charAt(0)}
        </span>
        <h3 className="text-sm font-semibold tracking-tight">{group.label}</h3>
      </div>

      {featured.map((item) => (
        <FeaturedRow
          key={item.to}
          item={item}
          accent={accent}
          active={isActive(item.to)}
          fav={isFavorite(item.to)}
          onNavigate={() => navigate(item.to)}
          onToggleFav={() => onToggleFav(item.to, item.label)}
        />
      ))}

      {rest.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {rest.map((item) => (
            <TileCard
              key={item.to}
              item={item}
              accent={accent}
              active={isActive(item.to)}
              fav={isFavorite(item.to)}
              onNavigate={() => navigate(item.to)}
              onToggleFav={() => onToggleFav(item.to, item.label)}
            />
          ))}
        </div>
      )}

      {subgroups.length > 0 && (
        <div className="space-y-2 pt-1">
          {subgroups.map((sg) => (
            <SubgroupBlock
              key={sg.label}
              subgroup={sg}
              accent={accent}
              pathname={pathname}
              onNavigate={(to) => navigate(to)}
              isFavorite={isFavorite}
              onToggleFav={onToggleFav}
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
  pathname,
  onNavigate,
  isFavorite,
  onToggleFav,
}: {
  subgroup: MoreSubGroup;
  accent: GroupAccent;
  pathname: string;
  onNavigate: (to: string) => void;
  isFavorite: (to: string) => boolean;
  onToggleFav: (to: string, label: string) => void;
}) {
  const matchesRoute = useMemo(() => {
    const inItems = subgroup.items.some(
      (it) => pathname === it.to || pathname.startsWith(it.to + "/"),
    );
    const inPrefixes = (subgroup.matchPrefixes ?? []).some((p) =>
      pathname.startsWith(p),
    );
    return inItems || inPrefixes;
  }, [pathname, subgroup]);

  const [open, setOpen] = useState<boolean>(
    subgroup.kind === "static" || matchesRoute,
  );
  const SgIcon = subgroup.icon;
  const isActive = (to: string) =>
    pathname === to || pathname.startsWith(to + "/");

  return (
    <div className="rounded-2xl border bg-card overflow-hidden">
      {subgroup.kind === "collapsible" ? (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="w-full flex items-center gap-3 px-3 py-3 text-left active:bg-muted/50 transition"
          aria-expanded={open}
        >
          <span
            className={cn(
              "inline-flex h-9 w-9 items-center justify-center rounded-xl",
              ACCENT_CHIP[accent],
            )}
          >
            <SgIcon className="h-4 w-4" />
          </span>
          <span className="flex-1 min-w-0 text-sm font-semibold truncate">
            {subgroup.label}
          </span>
          <span className="text-[11px] text-muted-foreground">
            {subgroup.items.length}
          </span>
          <ChevronDown
            className={cn(
              "h-4 w-4 text-muted-foreground transition-transform",
              open && "rotate-180",
            )}
          />
        </button>
      ) : (
        <div className="w-full flex items-center gap-3 px-3 py-3 border-b bg-muted/30">
          <span
            className={cn(
              "inline-flex h-9 w-9 items-center justify-center rounded-xl",
              ACCENT_CHIP[accent],
            )}
          >
            <SgIcon className="h-4 w-4" />
          </span>
          <span className="flex-1 min-w-0 text-sm font-semibold truncate">
            {subgroup.label}
          </span>
        </div>
      )}

      {open && (
        <ul className="divide-y">
          {subgroup.hubTo && (
            <li>
              <button
                type="button"
                onClick={() => onNavigate(subgroup.hubTo!)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left text-[13px] text-muted-foreground hover:text-foreground active:bg-muted/50 transition"
              >
                <span className="flex-1 min-w-0 truncate">
                  Ver visão geral de {subgroup.label.toLowerCase()}
                </span>
                <ChevronRight className="h-4 w-4 shrink-0" />
              </button>
            </li>
          )}
          {subgroup.items.map((item) => (
            <SubItemRow
              key={item.to}
              item={item}
              active={isActive(item.to)}
              fav={isFavorite(item.to)}
              onNavigate={() => onNavigate(item.to)}
              onToggleFav={() => onToggleFav(item.to, item.label)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function SubItemRow({
  item,
  active,
  fav,
  onNavigate,
  onToggleFav,
}: {
  item: NavLeaf;
  active: boolean;
  fav: boolean;
  onNavigate: () => void;
  onToggleFav: () => void;
}) {
  const Icon = item.icon;
  const lp = useLongPress(onToggleFav);
  return (
    <li>
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
          "w-full flex items-center gap-3 px-4 py-3 text-left active:bg-muted/50 transition",
          active && "bg-primary/5",
        )}
      >
        <Icon className={cn("h-4 w-4 shrink-0", active ? "text-primary" : "text-muted-foreground")} />
        <span className={cn("flex-1 min-w-0 text-sm truncate", active && "font-medium text-primary")}>
          {item.label}
        </span>
        {fav && <Star className="h-3.5 w-3.5 fill-primary text-primary shrink-0" />}
        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
      </button>
    </li>
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

function FeaturedRow({
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
        "w-full flex items-center gap-3 rounded-2xl border bg-card px-4 py-4 text-left",
        "active:scale-[0.99] transition-all shadow-sm",
        active && "border-primary/40 ring-1 ring-primary/20",
      )}
    >
      <span
        className={cn(
          "inline-flex h-11 w-11 items-center justify-center rounded-xl",
          ACCENT_CHIP[accent],
        )}
      >
        <Icon className="h-5 w-5" />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-semibold truncate">{item.label}</span>
      </span>
      {fav && <Star className="h-4 w-4 fill-primary text-primary shrink-0" />}
      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
    </button>
  );
}

function TileCard({
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
        "relative flex flex-col items-start gap-2 rounded-2xl border bg-card px-3 py-3 text-left h-[92px]",
        "active:scale-[0.98] transition-all",
        active && "border-primary/40 ring-1 ring-primary/20",
      )}
    >
      <span
        className={cn(
          "inline-flex h-8 w-8 items-center justify-center rounded-lg",
          ACCENT_CHIP[accent],
        )}
      >
        <Icon className="h-4 w-4" />
      </span>
      <span className="text-[13px] font-medium leading-tight line-clamp-2">
        {item.label}
      </span>
      {fav && (
        <Star className="absolute top-2 right-2 h-3.5 w-3.5 fill-primary text-primary" />
      )}
    </button>
  );
}
