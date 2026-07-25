import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

export type MobileFabAction = {
  label: string;
  onPress: () => void;
  /** When true, force-hide the FAB even if a module config declares one. */
  hidden?: boolean;
};

type Ctx = {
  action: MobileFabAction | null;
  register: (id: symbol, action: MobileFabAction) => void;
  unregister: (id: symbol) => void;
};

const MobileFabContext = createContext<Ctx | null>(null);

export function MobileFabProvider({ children }: { children: ReactNode }) {
  // Stack of registrations — the most recently mounted page wins.
  const stackRef = useRef<Array<{ id: symbol; action: MobileFabAction }>>([]);
  const [action, setAction] = useState<MobileFabAction | null>(null);

  const sync = useCallback(() => {
    const top = stackRef.current[stackRef.current.length - 1];
    setAction(top ? top.action : null);
  }, []);

  const register = useCallback(
    (id: symbol, next: MobileFabAction) => {
      const arr = stackRef.current;
      const idx = arr.findIndex((e) => e.id === id);
      if (idx >= 0) arr[idx] = { id, action: next };
      else arr.push({ id, action: next });
      sync();
    },
    [sync],
  );

  const unregister = useCallback(
    (id: symbol) => {
      stackRef.current = stackRef.current.filter((e) => e.id !== id);
      sync();
    },
    [sync],
  );

  const value = useMemo<Ctx>(() => ({ action, register, unregister }), [action, register, unregister]);

  return <MobileFabContext.Provider value={value}>{children}</MobileFabContext.Provider>;
}

export function useMobileFabState(): MobileFabAction | null {
  const ctx = useContext(MobileFabContext);
  return ctx?.action ?? null;
}

/**
 * Register a page-level FAB action. Automatically unregisters on unmount.
 * Pass `null` to explicitly hide the FAB for this route.
 */
export function useMobileFab(action: MobileFabAction | null) {
  const ctx = useContext(MobileFabContext);
  const idRef = useRef<symbol>();
  if (!idRef.current) idRef.current = Symbol("mobile-fab");

  useEffect(() => {
    if (!ctx) return;
    const id = idRef.current!;
    if (action) ctx.register(id, action);
    else ctx.register(id, { label: "", onPress: () => {}, hidden: true });
    return () => ctx.unregister(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action?.label, action?.hidden, action?.onPress]);
}
