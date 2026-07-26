import { useCallback, useEffect, useState } from "react";
import { MODULE_NAV } from "@/config/mobileNav";
import type { NavLeaf } from "@/config/mobileNav";
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

function resolve(
  mod: ActiveModule,
  slot: ShortcutSlot,
  storedTo: string | null,
  otherTo: string,
): NavLeaf {
  const config = MODULE_NAV[mod] ?? MODULE_NAV.financeiro;
  const options = config.shortcutOptions;
  const fallback = slot === "a" ? config.defaultShortcutA : config.defaultShortcutB;

  if (storedTo && storedTo !== otherTo) {
    const found = options.find((it) => it.to === storedTo);
    if (found) return found;
  }
  // Fallback padrão — se colide com o outro slot, escolhe primeira opção diferente.
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

  // Primeiro resolve com valores tentativos para saber colisões.
  const tentativeA = rawA ?? config.defaultShortcutA.to;
  const tentativeB = rawB ?? config.defaultShortcutB.to;

  const shortcutA = resolve(mod, "a", rawA, tentativeB);
  const shortcutB = resolve(mod, "b", rawB, shortcutA.to);

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
    options: config.shortcutOptions,
  };
}
