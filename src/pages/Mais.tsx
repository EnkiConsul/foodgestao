import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LayoutGrid, LogOut, Search, SearchX, Sliders, User, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useActiveModule } from "@/hooks/useActiveModule";
import { useSuperAdmin } from "@/hooks/useSuperAdmin";
import { MODULE_NAV, type NavLeaf } from "@/config/mobileNav";
import { useFavoriteNavItems } from "@/hooks/useFavoriteNavItems";
import { MoreHeader } from "@/components/mobile/MoreHeader";
import { MoreGroupSection } from "@/components/mobile/MoreGroupSection";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const norm = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export default function Mais() {
  const activeModule = useActiveModule();
  const navigate = useNavigate();
  const { signOut, user } = useAuth();
  const { isSuperAdmin } = useSuperAdmin();
  const { favorites, isFavorite, toggle, max } = useFavoriteNavItems();
  const [query, setQuery] = useState("");

  const config = MODULE_NAV[activeModule] ?? MODULE_NAV.financeiro;

  const allItems: NavLeaf[] = useMemo(
    () =>
      config.moreGroups.flatMap((g) => [
        ...(g.items ?? []),
        ...(g.subgroups ?? []).flatMap((sg) => sg.items),
      ]),
    [config.moreGroups],
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

  const searchResults = useMemo(() => {
    if (!isSearching) return [];
    return allItems.filter((it) => norm(it.label).includes(q));
  }, [allItems, q, isSearching]);

  const handleToggleFav = (to: string, label: string) => {
    const res = toggle(to);
    if (res === "added") toast.success(`"${label}" adicionado aos favoritos`);
    else if (res === "removed") toast(`"${label}" removido dos favoritos`);
    else if (res === "limit") toast.error(`Limite de ${max} favoritos atingido`);
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      try { navigator.vibrate(15); } catch { /* noop */ }
    }
  };

  const openCustomizer = () => {
    window.dispatchEvent(new CustomEvent("mobile-nav:customize", { detail: { slot: "a" } }));
  };

  return (
    <div className="min-h-full bg-background pb-[calc(80px+env(safe-area-inset-bottom))]">
      <MoreHeader />

      <div className="px-4 pt-4 space-y-4">
        {/* Cartão destaque: Hub */}
        <button
          type="button"
          onClick={() => navigate("/hub")}
          className="w-full flex items-center gap-3 rounded-2xl border bg-gradient-to-br from-primary/10 to-primary/5 px-4 py-4 text-left active:scale-[0.99] transition"
        >
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <LayoutGrid className="h-5 w-5" />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-semibold">Acompanhar módulos</span>
            <span className="block text-xs text-muted-foreground">
              Alternar entre Financeiro, DP e outros
            </span>
          </span>
        </button>

        {/* Busca */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar funcionalidade..."
            className="pl-9 pr-9 h-11 rounded-xl"
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
      </div>

      <div className="px-4 py-4 space-y-6">
        {isSearching ? (
          searchResults.length > 0 ? (
            <MoreGroupSection
              group={{ label: "Resultados", accent: "primary", items: searchResults }}
              isFavorite={isFavorite}
              onToggleFav={handleToggleFav}
            />
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-center gap-2 text-muted-foreground">
              <SearchX className="h-8 w-8" />
              <p className="text-sm">Nenhum item encontrado</p>
            </div>
          )
        ) : (
          <>
            {favoriteItems.length > 0 ? (
              <MoreGroupSection
                group={{
                  label: "Favoritos",
                  accent: "amber",
                  items: favoriteItems.map((it, i) => ({ ...it, featured: i === 0 })),
                }}
                isFavorite={isFavorite}
                onToggleFav={handleToggleFav}
              />
            ) : (
              <div className={cn(
                "rounded-xl border border-dashed p-3 text-[11px] text-muted-foreground text-center",
              )}>
                Toque e segure em qualquer item para adicionar aos favoritos.
              </div>
            )}

            {config.moreGroups.map((group) => (
              <MoreGroupSection
                key={group.label}
                group={group}
                isFavorite={isFavorite}
                onToggleFav={handleToggleFav}
              />
            ))}

            <div className="grid grid-cols-2 gap-2 pt-2">
              <Button
                variant="outline"
                className="h-11 rounded-xl justify-start gap-2"
                onClick={openCustomizer}
              >
                <Sliders className="h-4 w-4" />
                Personalizar barra
              </Button>
              <Button
                variant="outline"
                className="h-11 rounded-xl justify-start gap-2 text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
                onClick={async () => { await signOut(); }}
              >
                <LogOut className="h-4 w-4" />
                Sair
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

