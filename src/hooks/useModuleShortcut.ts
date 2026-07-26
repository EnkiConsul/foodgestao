import { useCallback, useEffect, useMemo, useState } from "react";
import { MODULE_NAV } from "@/config/mobileNav";
import type { MoreGroup, NavLeaf } from "@/config/mobileNav";
import type { ActiveModule } from "@/hooks/useActiveModule";

export type ShortcutSlot = "a" | "b";

const keyOf = (mod: ActiveModule, slot: ShortcutSlot) =>
  `360food:mobile-shortcut:${mod}:${slot}`;

function readStored(mod: ActiveModule, slot: ShortcutSlot): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(keyOf(mod, slot));
  } catch {
    return null;
  }
}

/** Achata todas as telas visíveis do módulo (items + subgroups.items),
 *  ignorando o grupo "Conta" para não misturar contexto no customizer. */
function flattenModuleOptions(groups: MoreGroup[]): NavLeaf[] {
  const out: NavLeaf[] = [];
  const seen = new Set<string>();
  for (const g of groups) {
    if ((g.accent ?? "") === "muted") continue; // pula "Conta"
    for (const it of g.items ?? []) {
      if (seen.has(it.to)) continue;
      seen.add(it.to);
      out.push(it);
    }
    for (const sg of g.subgroups ?? []) {
      for (const it of sg.items) {
        if (seen.has(it.to)) continue;
        seen.add(it.to);
        out.push(it);
      }
    }
  }
  return out;
}

function resolve(
  mod: ActiveModule,
  slot: ShortcutSlot,
  storedTo: string | null,
  otherTo: string,
  options: NavLeaf[],
): NavLeaf {
  const config = MODULE_NAV[mod] ?? MODULE_NAV.financeiro;
  const fallback = slot === "a" ? config.defaultShortcutA : config.defaultShortcutB;

  if (storedTo && storedTo !== otherTo) {
    const found = options.find((it) => it.to === storedTo);
    if (found) return found;
  }
  if (fallback.to !== otherTo) return fallback;
  const alt = options.find((it) => it.to !== otherTo);
  return alt ?? fallback;
}

/**
 * Hook dos dois slots customizáveis da BottomNav.
 * Persiste em localStorage por módulo + posição. Impede colisão entre A e B.
 */
export function useModuleShortcuts(mod: ActiveModule) {
  const [rawA, setRawA] = useState<string | null>(() => readStored(mod, "a"));
  const [rawB, setRawB] = useState<string | null>(() => readStored(mod, "b"));

  useEffect(() => {
    setRawA(readStored(mod, "a"));
    setRawB(readStored(mod, "b"));
  }, [mod]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onStorage = (e: StorageEvent) => {
      if (e.key === keyOf(mod, "a")) setRawA(e.newValue);
      if (e.key === keyOf(mod, "b")) setRawB(e.newValue);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [mod]);

  const config = MODULE_NAV[mod] ?? MODULE_NAV.financeiro;

  // Universo completo de telas do módulo (achatado a partir de moreGroups).
  const options = useMemo(() => flattenModuleOptions(config.moreGroups), [config.moreGroups]);

  // Primeiro resolve com valores tentativos para saber colisões.
  const tentativeA = rawA ?? config.defaultShortcutA.to;
  const tentativeB = rawB ?? config.defaultShortcutB.to;

  const shortcutA = resolve(mod, "a", rawA, tentativeB, options);
  const shortcutB = resolve(mod, "b", rawB, shortcutA.to, options);

  const setShortcut = useCallback(
    (slot: ShortcutSlot, to: string) => {
      try {
        window.localStorage.setItem(keyOf(mod, slot), to);
      } catch {
        /* noop */
      }
      if (slot === "a") setRawA(to);
      else setRawB(to);
    },
    [mod],
  );

  return {
    shortcutA,
    shortcutB,
    setShortcut,
    options,
  };
}
