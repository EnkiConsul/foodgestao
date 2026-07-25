import { useCallback, useEffect, useState } from "react";

const KEY = "360food:mobile-fav-nav:v1";
const MAX = 6;

function read(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string").slice(0, MAX) : [];
  } catch {
    return [];
  }
}

function write(items: string[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items.slice(0, MAX)));
  } catch {
    /* ignore quota errors */
  }
}

export function useFavoriteNavItems() {
  const [favorites, setFavorites] = useState<string[]>(() => read());

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) setFavorites(read());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const isFavorite = useCallback((to: string) => favorites.includes(to), [favorites]);

  const toggle = useCallback((to: string): "added" | "removed" | "limit" => {
    let result: "added" | "removed" | "limit" = "added";
    setFavorites((prev) => {
      if (prev.includes(to)) {
        result = "removed";
        const next = prev.filter((x) => x !== to);
        write(next);
        return next;
      }
      if (prev.length >= MAX) {
        result = "limit";
        return prev;
      }
      const next = [...prev, to];
      write(next);
      return next;
    });
    return result;
  }, []);

  return { favorites, isFavorite, toggle, max: MAX };
}
