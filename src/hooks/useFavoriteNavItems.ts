import { useCallback, useEffect, useMemo, useState } from "react";
import { useDpUserPrefs } from "@/hooks/useDpUserPrefs";

const KEY = "360food:mobile-fav-nav:v1";
const MAX = 6;

function readLocal(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string").slice(0, MAX) : [];
  } catch {
    return [];
  }
}

function writeLocal(items: string[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items.slice(0, MAX)));
  } catch {
    /* ignore quota errors */
  }
}

/**
 * Fonte unificada de favoritos: quando `useDpUserPrefs` estiver disponível
 * (usuário autenticado com empresa selecionada), lê/grava em
 * `dp_user_prefs.extras.favoritos_paginas` — mesmo local do desktop.
 * Caso contrário, cai no `localStorage` como fallback.
 */
export function useFavoriteNavItems() {
  const { available, favoritePages, toggleFavoritePage } = useDpUserPrefs();
  const [local, setLocal] = useState<string[]>(() => readLocal());

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) setLocal(readLocal());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const favorites = useMemo<string[]>(
    () => (available ? favoritePages.slice(0, MAX) : local),
    [available, favoritePages, local],
  );

  const isFavorite = useCallback((to: string) => favorites.includes(to), [favorites]);

  const toggle = useCallback(
    (to: string): "added" | "removed" | "limit" => {
      const current = favorites;
      const has = current.includes(to);
      if (!has && current.length >= MAX) return "limit";

      if (available) {
        toggleFavoritePage(to);
      } else {
        const next = has ? current.filter((x) => x !== to) : [...current, to];
        writeLocal(next);
        setLocal(next);
      }
      return has ? "removed" : "added";
    },
    [available, favorites, toggleFavoritePage],
  );

  return { favorites, isFavorite, toggle, max: MAX };
}
