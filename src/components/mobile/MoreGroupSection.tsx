import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ChevronDown, Star } from "lucide-react";
import type {
  GroupAccent,
  MoreGroup,
  MoreSubGroup,
  NavLeaf,
} from "@/config/mobileNav";
import { cn } from "@/lib/utils";
import { makeIsActive } from "@/lib/nav-active";

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
  /** Se true, não renderiza o cabeçalho do grupo (título + chevron do grupo raiz). */
  hideHeader?: boolean;
};

export function MoreGroupSection({ group, isFavorite, onToggleFav, hideHeader }: Props) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const accent = group.accent ?? "muted";

  const items = group.items ?? [];
  const subgroups = group.subgroups ?? [];

  // Conta (muted) começa fechado; demais abertos.
  const [open, setOpen] = useState<boolean>(accent !== "muted");
  const showContent = hideHeader ? true : open;

  // Ativo por especificidade: só a rota mais longa que casa com o pathname.
  const isActive = makeIsActive(pathname, [
    ...items.map((i) => i.to),
    ...subgroups.flatMap((sg) => sg.items.map((i) => i.to)),
  ]);

  const handleNavigate = (to: string) => navigate(to);
  const handleFav = (to: string, label: string) => onToggleFav(to, label);

  return (
    <section className="space-y-3">
      {!hideHeader && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="w-full flex items-center gap-2 px-1 py-1 text-left"
          aria-expanded={open}
        >
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
      )}

      {showContent && (
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
  const { pathname } = useLocation();
  const autoOpen = (subgroup.matchPrefixes ?? []).some((p) =>
    pathname === p || pathname.startsWith(p + "/") || pathname.startsWith(p),
  );
  const [open, setOpen] = useState<boolean>(true);
  // Se rota bater, garantir aberto quando muda para essa rota.
  useEffect(() => {
    if (autoOpen) setOpen(true);
  }, [autoOpen]);

  const headerClickable = Boolean(subgroup.hubTo);

  return (
    <div className="rounded-2xl border bg-card p-3 space-y-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={!headerClickable}
          onClick={() => headerClickable && onNavigate(subgroup.hubTo!)}
          className={cn(
            "flex flex-1 min-w-0 items-center gap-2 text-left",
            headerClickable && "active:opacity-70",
          )}
        >
          <span
            className={cn(
              "inline-flex h-8 w-8 items-center justify-center rounded-lg shrink-0",
              ACCENT_CHIP[accent],
            )}
          >
            <SgIcon className="h-4 w-4" />
          </span>
          <span className="flex-1 min-w-0 text-[13px] font-semibold truncate">
            {subgroup.label}
          </span>
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setOpen((v) => !v);
          }}
          aria-expanded={open}
          aria-label={open ? `Ocultar ${subgroup.label}` : `Mostrar ${subgroup.label}`}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
        >
          <ChevronDown
            className={cn("h-4 w-4 transition-transform", open && "rotate-180")}
          />
        </button>
      </div>
      {open && (
        <TileGrid
          items={subgroup.items}
          accent={accent}
          isActive={isActive}
          isFavorite={isFavorite}
          onNavigate={onNavigate}
          onToggleFav={onToggleFav}
        />
      )}
    </div>
  );
}

/** Escolhe entre 3 ou 4 colunas conforme a quantidade de itens, para evitar
 * linhas com muitos "buracos". Flex-wrap com justify-center centraliza a última
 * linha quando ela ficar incompleta. */
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
  // Fixo em 3 colunas para dar mais espaço horizontal aos rótulos.
  // flex-wrap + justify-center centraliza órfãos na última linha.
  return (
    <div className="flex flex-wrap justify-center gap-x-2 gap-y-5">
      {items.map((item) => (
        <div key={item.to} className="flex w-[calc(33.333%-6px)]">
          <IFoodTile
            item={item}
            accent={accent}
            active={isActive(item.to)}
            fav={isFavorite(item.to)}
            onNavigate={() => onNavigate(item.to)}
            onToggleFav={() => onToggleFav(item.to, item.label)}
          />
        </div>
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
        "relative flex w-full min-w-0 flex-col items-center justify-start gap-1.5 px-1.5 py-2 rounded-xl text-center",
        "active:scale-[0.95] transition-transform",
      )}
    >
      <span
        className={cn(
          "relative inline-flex h-12 w-12 items-center justify-center rounded-full shrink-0",
          ACCENT_CHIP[accent],
          active && "ring-2 ring-primary/60",
        )}
      >
        <Icon className="h-5 w-5" />
        {fav && (
          <Star
            className="absolute -top-0.5 -right-0.5 h-3.5 w-3.5 fill-primary text-primary rounded-full ring-2 ring-background"
          />
        )}
      </span>
      <span className={cn(
        "block w-full text-[11px] leading-[1.15] tracking-tight whitespace-normal break-normal [overflow-wrap:normal] hyphens-none",
        active ? "font-semibold text-primary" : "text-foreground/80",
      )}>
        {item.label}
      </span>
      {item.badge && (
        <span className="mt-0.5 block text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
          {item.badge}
        </span>
      )}

    </button>
  );
}
