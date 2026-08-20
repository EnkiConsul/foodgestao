import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LogOut, SearchX, Sliders, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { MODULE_LABEL, useActiveModule } from "@/hooks/useActiveModule";
import { useSuperAdmin } from "@/hooks/useSuperAdmin";
import { MODULE_NAV, type NavLeaf } from "@/config/mobileNav";
import { useFavoriteNavItems } from "@/hooks/useFavoriteNavItems";
import { MoreHeader } from "@/components/mobile/MoreHeader";
import { MoreGroupSection } from "@/components/mobile/MoreGroupSection";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useDpMenuLayout } from "@/hooks/useDpMenuLayout";
import { useHiddenScreens } from "@/hooks/useHiddenScreens";
import { filterMoreGroups } from "@/lib/nav/hiddenScreens";
import {
  orderLeavesByLayout,
  orderSubgroupsByLayout,
} from "@/lib/dp/menuLayout";

const norm = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export default function Mais() {
  const activeModule = useActiveModule();
  const navigate = useNavigate();
  const { signOut, user } = useAuth();
  const { isSuperAdmin } = useSuperAdmin();
  const { favorites, isFavorite, toggle, max } = useFavoriteNavItems();
  const [query, setQuery] = useState("");

  const rawConfig = MODULE_NAV[activeModule] ?? MODULE_NAV.financeiro;
  const moduleLabel = MODULE_LABEL[activeModule];

  // Ordem personalizada do menu do DP / Portal (mesma fonte da sidebar).
  const isDpSurface = activeModule === "dp" || activeModule === "portal_colaborador";
  const { layout } = useDpMenuLayout(
    activeModule === "portal_colaborador" ? "portal" : "dp",
  );
  const { hidden } = useHiddenScreens();
  const config = useMemo(() => {
    const ordered =
      isDpSurface && layout
        ? {
            ...rawConfig,
            moreGroups: rawConfig.moreGroups.map((g) =>
              g.subgroups
                ? {
                    ...g,
                    subgroups: orderSubgroupsByLayout(g.subgroups, layout).map((sg) => ({
                      ...sg,
                      items: orderLeavesByLayout(sg.id, sg.items, layout),
                    })),
                  }
                : g,
            ),
          }
        : rawConfig;
    return { ...ordered, moreGroups: filterMoreGroups(ordered.moreGroups, hidden) };
  }, [rawConfig, isDpSurface, layout, hidden]);



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
      <MoreHeader query={query} onQueryChange={setQuery} />

      <div className="px-4 pt-12 pb-4 space-y-6">
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
                hideHeader={group.label === moduleLabel}
                isFavorite={isFavorite}
                onToggleFav={handleToggleFav}
              />
            ))}

            <div className="flex flex-col gap-2 pt-2">
              <Button
                variant="outline"
                className="w-full h-11 rounded-xl justify-start gap-2"
                onClick={openCustomizer}
              >
                <Sliders className="h-4 w-4 shrink-0" />
                <span className="truncate">Personalizar Barra</span>
              </Button>
              <Button
                variant="outline"
                className="w-full h-11 rounded-xl justify-start gap-2 text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
                onClick={async () => { await signOut(); }}
              >
                <LogOut className="h-4 w-4 shrink-0" />
                <span className="truncate">Sair</span>
              </Button>
            </div>

            {/* Rodapé do usuário — espelha o menu lateral do desktop */}
            <div className="mt-4 flex items-center gap-3 rounded-2xl border bg-card px-3 py-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground shrink-0">
                <User className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">
                  {(user?.user_metadata as { full_name?: string } | undefined)?.full_name
                    || user?.email
                    || "Usuário"}
                </p>
                <p className="text-[11px] text-muted-foreground truncate">
                  {isSuperAdmin
                    ? "Super Admin"
                    : activeModule === "portal_colaborador"
                      ? "Colaborador"
                      : "Administrador"}
                </p>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

