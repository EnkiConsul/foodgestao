import { useCallback, useEffect, useState } from "react";
import { MODULE_NAV } from "@/config/mobileNav";
import type { NavLeaf } from "@/config/mobileNav";
import type { ActiveModule } from "@/hooks/useActiveModule";

const keyOf = (mod: ActiveModule) => `360food:mobile-shortcut:${mod}`;

function readStored(mod: ActiveModule): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(keyOf(mod));
  } catch {
    return null;
  }
}

function resolve(mod: ActiveModule, to: string | null): NavLeaf {
  const config = MODULE_NAV[mod];
  if (!config) return { icon: MODULE_NAV.financeiro.defaultShortcut.icon, label: "", to: "/" };
  if (to) {
    const found = config.shortcutOptions.find((it) => it.to === to);
    if (found) return found;
  }
  return config.defaultShortcut;
}

/**
 * Hook do slot customizável da BottomNav.
 * Persiste em localStorage por módulo. Devolve item resolvido para render.
 */
export function useModuleShortcut(mod: ActiveModule) {
  const [rawTo, setRawTo] = useState<string | null>(() => readStored(mod));

  useEffect(() => {
    setRawTo(readStored(mod));
  }, [mod]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onStorage = (e: StorageEvent) => {
      if (e.key === keyOf(mod)) setRawTo(e.newValue);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [mod]);

  const setShortcut = useCallback(
    (to: string) => {
      try {
        window.localStorage.setItem(keyOf(mod), to);
      } catch {
        /* noop */
      }
      setRawTo(to);
    },
    [mod],
  );

  const config = MODULE_NAV[mod];
  const options = config?.shortcutOptions ?? [];
  const shortcut = resolve(mod, rawTo);

  return { shortcut, setShortcut, options };
}
