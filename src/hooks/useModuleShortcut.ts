import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useHiddenScreens } from "@/hooks/useHiddenScreens";
import { filterMoreGroups } from "@/lib/nav/hiddenScreens";
import { MODULE_NAV } from "@/config/mobileNav";
import type { MoreGroup, NavLeaf } from "@/config/mobileNav";
import type { ActiveModule } from "@/hooks/useActiveModule";
import { useDpUserPrefs } from "@/hooks/useDpUserPrefs";

export type ShortcutSlot = "a" | "b" | "c";

const keyOf = (mod: string, slot: ShortcutSlot) =>
  `aveto:mobile-shortcut:v2:${mod}:${slot}`;

function readStored(mod: string, slot: ShortcutSlot): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(keyOf(mod, slot));
  } catch {
    return null;
  }
}

function writeStored(mod: string, slot: ShortcutSlot, to: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(keyOf(mod, slot), to);
  } catch {
    /* noop */
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
  fallback: NavLeaf,
  storedTo: string | null,
  otherTos: string[],
  options: NavLeaf[],
): NavLeaf {
  if (storedTo && !otherTos.includes(storedTo)) {
    const found = options.find((it) => it.to === storedTo);
    if (found) return found;
  }
  if (!otherTos.includes(fallback.to)) return fallback;
  const alt = options.find((it) => !otherTos.includes(it.to) && it.to !== fallback.to);
  return alt ?? fallback;
}

/**
 * Hook dos slots customizáveis da BottomNav.
 * - Sincroniza via `dp_user_prefs.extras.mobile_shortcuts` quando o usuário
 *   está autenticado e tem empresa selecionada; senão, cai para localStorage.
 * - No módulo Hub existe também o slot "c" (1º botão da barra).
 */
export function useModuleShortcuts(mod: ActiveModule) {
  const { available, mobileShortcuts, setMobileShortcut } = useDpUserPrefs();
  // Portal: versão nova dos atalhos (2 = Documentos, 4 = Calendário) para todos.
  const store = mod === "portal_colaborador" ? "portal_colaborador_v3" : mod === "dp" ? "dp_v2" : mod;

  const [localA, setLocalA] = useState<string | null>(() => readStored(store, "a"));
  const [localB, setLocalB] = useState<string | null>(() => readStored(store, "b"));
  const [localC, setLocalC] = useState<string | null>(() => readStored(store, "c"));

  useEffect(() => {
    setLocalA(readStored(store, "a"));
    setLocalB(readStored(store, "b"));
    setLocalC(readStored(store, "c"));
  }, [store]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onStorage = (e: StorageEvent) => {
      if (e.key === keyOf(store, "a")) setLocalA(e.newValue);
      if (e.key === keyOf(store, "b")) setLocalB(e.newValue);
      if (e.key === keyOf(store, "c")) setLocalC(e.newValue);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [store]);

  const config = MODULE_NAV[mod] ?? MODULE_NAV.financeiro;
  const { hidden } = useHiddenScreens();

  // Universo completo de telas do módulo (achatado a partir de moreGroups),
  // sem as telas ocultadas pelo super admin.
  const options = useMemo(
    () => flattenModuleOptions(filterMoreGroups(config.moreGroups, hidden)),
    [config.moreGroups, hidden],
  );


  // Fonte primária: se sincronização estiver disponível, usa o backend;
  // senão, localStorage.
  const remote = available ? mobileShortcuts[store] ?? {} : null;
  const rawA = remote ? remote.a ?? null : localA;
  const rawB = remote ? remote.b ?? null : localB;
  const rawC = remote ? remote.c ?? null : localC;

  // Resolve garantindo A ≠ B ≠ C.
  const shortcutA = resolve(config.defaultShortcutA, rawA, [], options);
  const shortcutB = resolve(config.defaultShortcutB, rawB, [shortcutA.to], options);
  const shortcutC = config.defaultShortcutC
    ? resolve(config.defaultShortcutC, rawC, [shortcutA.to, shortcutB.to], options)
    : shortcutA; // fallback quando o módulo não tem slot C

  // ── Migração one-shot: se acabou de logar e há dados no localStorage
  // mas o backend está vazio para este módulo, promove os locais.
  const migratedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!available) return;
    if (migratedRef.current.has(store)) return;
    const backendHas = remote && (remote.a || remote.b || remote.c);
    if (backendHas) {
      migratedRef.current.add(store);
      return;
    }
    const a = readStored(store, "a");
    const b = readStored(store, "b");
    const c = readStored(store, "c");
    if (a) setMobileShortcut(store, "a", a);
    if (b) setMobileShortcut(store, "b", b);
    if (c) setMobileShortcut(store, "c", c);
    migratedRef.current.add(store);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [available, store]);

  const setShortcut = useCallback(
    (slot: ShortcutSlot, to: string) => {
      if (available) {
        setMobileShortcut(store, slot, to);
      } else {
        writeStored(store, slot, to);
        if (slot === "a") setLocalA(to);
        else if (slot === "b") setLocalB(to);
        else setLocalC(to);
      }
    },
    [available, store, setMobileShortcut],
  );

  return {
    shortcutA,
    shortcutB,
    shortcutC,
    hasSlotC: !!config.defaultShortcutC,
    setShortcut,
    options,
  };
}
