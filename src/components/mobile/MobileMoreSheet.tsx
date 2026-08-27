import { useNavigate, useLocation } from "react-router-dom";
import { LayoutGrid, LogOut, Search, SearchX, Sliders, Star, X } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import type { MoreGroup, NavLeaf } from "@/config/mobileNav";
import { cn } from "@/lib/utils";
import { makeIsActive } from "@/lib/nav-active";
import { useMemo, useRef, useState } from "react";
import { useFavoriteNavItems } from "@/hooks/useFavoriteNavItems";
import { toast } from "sonner";

type Props = {
  groups: MoreGroup[];
  trigger: React.ReactNode;
  onCustomizeShortcut?: () => void;
};

const norm = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

const LONG_PRESS_MS = 550;

export function MobileMoreSheet({ groups, trigger, onCustomizeShortcut }: Props) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const { favorites, isFavorite, toggle, max } = useFavoriteNavItems();

  const allItems: NavLeaf[] = useMemo(
    () => groups.flatMap((g) => g.items ?? []),
    [groups],
  );

  const favoriteItems: NavLeaf[] = useMemo(
    () =>
      favorites
        .map((to) => allItems.find((it) => it.to === to))
        .filter((x): x is NavLeaf => Boolean(x)),
    [favorites, allItems],
  );

  const q = norm(query.trim());
  const isSearching = q.length > 0;

  const searchResults: NavLeaf[] = useMemo(() => {
    if (!isSearching) return [];
    return allItems.filter((it) => norm(it.label).includes(q));
  }, [allItems, q, isSearching]);

  const go = (to: string) => {
    setOpen(false);
    setQuery("");
    navigate(to);
  };

  const handleToggleFav = (to: string, label: string) => {
    const res = toggle(to);
    if (res === "added") toast.success(`"${label}" adicionado aos favoritos`);
    else if (res === "removed") toast(`"${label}" removido dos favoritos`);
    else if (res === "limit") toast.error(`Limite de ${max} favoritos atingido`);
    if (navigator.vibrate) { try { navigator.vibrate(15); } catch { /* noop */ } }
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setQuery("");
      }}
    >
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent side="bottom" className="h-[88vh] rounded-t-2xl p-0 flex flex-col">
        <SheetHeader className="px-5 pt-5 pb-3 border-b space-y-3">
          <SheetTitle className="text-left">Mais opções</SheetTitle>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar funcionalidade..."
              className="pl-9 pr-9 h-11"
              autoFocus={false}
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-muted-foreground hover:bg-muted"
                aria-label="Limpar busca"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          {!isSearching && (
            <div className="flex flex-col gap-2">
              <Button
                variant="outline"
                className="h-11 w-full justify-start gap-2"
                onClick={() => go("/hub")}
              >
                <LayoutGrid className="h-4 w-4" />
                Acompanhar módulos (Hub)
              </Button>
              {onCustomizeShortcut && (
                <Button
                  variant="ghost"
                  className="h-11 w-full justify-start gap-2"
                  onClick={() => {
                    setOpen(false);
                    onCustomizeShortcut();
                  }}
                >
                  <Sliders className="h-4 w-4" />
                  Personalizar barra
                </Button>
              )}
            </div>
          )}
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
          {isSearching ? (
            searchResults.length > 0 ? (
              <ItemList
                items={searchResults}
                pathname={pathname}
                isFavorite={isFavorite}
                onNavigate={go}
                onToggleFav={handleToggleFav}
              />
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center gap-2 text-muted-foreground">
                <SearchX className="h-8 w-8" />
                <p className="text-sm">Nenhum item encontrado</p>
              </div>
            )
          ) : (
            <>
              {favoriteItems.length > 0 && (
                <section>
                  <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                    <Star className="h-3 w-3 fill-primary text-primary" />
                    Favoritos
                  </h3>
                  <ItemList
                    items={favoriteItems}
                    pathname={pathname}
                    isFavorite={isFavorite}
                    onNavigate={go}
                    onToggleFav={handleToggleFav}
                  />
                </section>
              )}

              {favoriteItems.length === 0 && (
                <div className="rounded-xl border border-dashed p-3 text-[11px] text-muted-foreground text-center">
                  Toque e segure em qualquer item para adicionar aos favoritos.
                </div>
              )}

              {groups.map((group) => (
                <section key={group.label}>
                  <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    {group.label}
                  </h3>
                  <ItemList
                    items={group.items ?? []}
                    pathname={pathname}
                    isFavorite={isFavorite}
                    onNavigate={go}
                    onToggleFav={handleToggleFav}
                  />
                </section>
              ))}

              <button
                onClick={async () => {
                  setOpen(false);
                  await signOut();
                }}
                className="w-full min-h-11 flex items-center gap-3 px-4 py-3 rounded-xl border border-destructive/30 text-destructive hover:bg-destructive/10 active:scale-[0.98] transition-all"
              >
                <LogOut className="h-5 w-5" />
                <span className="text-sm font-medium">Sair</span>
              </button>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function ItemList({
  items,
  pathname,
  isFavorite,
  onNavigate,
  onToggleFav,
}: {
  items: NavLeaf[];
  pathname: string;
  isFavorite: (to: string) => boolean;
  onNavigate: (to: string) => void;
  onToggleFav: (to: string, label: string) => void;
}) {
  // Ativo por especificidade dentro da lista renderizada.
  const isActive = makeIsActive(pathname, items.map((i) => i.to));
  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      {items.map((item, i) => (
        <ItemRow
          key={item.to + i}
          item={item}
          isFirst={i === 0}
          active={isActive(item.to)}
          fav={isFavorite(item.to)}
          onNavigate={onNavigate}
          onToggleFav={onToggleFav}
        />
      ))}
    </div>
  );
}

function ItemRow({
  item,
  isFirst,
  active,
  fav,
  onNavigate,
  onToggleFav,
}: {
  item: NavLeaf;
  isFirst: boolean;
  active: boolean;
  fav: boolean;
  onNavigate: (to: string) => void;
  onToggleFav: (to: string, label: string) => void;
}) {
  const Icon = item.icon;
  const timerRef = useRef<number | null>(null);
  const longPressedRef = useRef(false);

  const startPress = () => {
    longPressedRef.current = false;
    timerRef.current = window.setTimeout(() => {
      longPressedRef.current = true;
      onToggleFav(item.to, item.label);
    }, LONG_PRESS_MS);
  };
  const cancelPress = () => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  return (
    <button
      onPointerDown={startPress}
      onPointerUp={cancelPress}
      onPointerLeave={cancelPress}
      onPointerCancel={cancelPress}
      onClick={() => {
        if (longPressedRef.current) {
          longPressedRef.current = false;
          return;
        }
        onNavigate(item.to);
      }}
      className={cn(
        "w-full min-h-11 flex items-center gap-3 px-4 py-3 text-left active:scale-[0.98] transition-all",
        !isFirst && "border-t",
        active ? "bg-primary/10 text-primary" : "hover:bg-muted/50",
      )}
    >
      <Icon className="h-5 w-5 shrink-0" />
      <span className="text-sm font-medium flex-1">{item.label}</span>
      {item.badge && (
        <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
          {item.badge}
        </span>
      )}

      {fav && <Star className="h-4 w-4 fill-primary text-primary shrink-0" />}
    </button>
  );
}
