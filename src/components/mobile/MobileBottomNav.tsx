import { useLocation } from "react-router-dom";
import { LayoutGrid, MoreHorizontal, Sliders } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useActiveModule, type ActiveModule } from "@/hooks/useActiveModule";
import { MODULE_NAV, type NavLeaf } from "@/config/mobileNav";
import { useModuleShortcuts, type ShortcutSlot } from "@/hooks/useModuleShortcut";
import { BottomNavShape } from "./BottomNavShape";
import { cn } from "@/lib/utils";
import { useEffect, useMemo, useRef, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { toast } from "sonner";

const NAV_HEIGHT = 64;

function haptic(ms = 8) {
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
    try { navigator.vibrate(ms); } catch { /* noop */ }
  }
}

type SlotDef =
  | { kind: "link"; item: NavLeaf; longPressSlot?: ShortcutSlot }
  | { kind: "home"; item: NavLeaf }
  | { kind: "more" };

export function MobileBottomNav() {
  const activeModule = useActiveModule();
  const { pathname } = useLocation();
  const navRef = useRef<HTMLElement | null>(null);
  const slotRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null);

  const config = MODULE_NAV[activeModule] ?? MODULE_NAV.financeiro;
  const { shortcutA, shortcutB, setShortcut, options } = useModuleShortcuts(activeModule);

  const [customizerSlot, setCustomizerSlot] = useState<ShortcutSlot | null>(null);

  // Página /mais dispara este evento no botão "Personalizar barra".
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ slot?: ShortcutSlot }>).detail;
      setCustomizerSlot(detail?.slot ?? "a");
    };
    window.addEventListener("mobile-nav:customize", handler as EventListener);
    return () => window.removeEventListener("mobile-nav:customize", handler as EventListener);
  }, []);

  const isHubModule = activeModule === "hub";

  // Slot 1: Hub em geral; no módulo Hub, vira Financeiro (primeiro atalho fixo).
  const slot1: NavLeaf = useMemo(
    () =>
      isHubModule
        ? { icon: options[0]?.icon ?? LayoutGrid, label: options[0]?.label ?? "Financeiro", to: options[0]?.to ?? "/dashboard" }
        : { icon: LayoutGrid, label: "Hub", to: config.hubTo, end: true },
    [isHubModule, options, config.hubTo],
  );

  const slots: SlotDef[] = useMemo(
    () => [
      { kind: "link", item: slot1 },
      { kind: "link", item: shortcutA, longPressSlot: "a" },
      { kind: "home", item: config.home },
      { kind: "link", item: shortcutB, longPressSlot: "b" },
      { kind: "more" },
    ],
    [slot1, shortcutA, shortcutB, config.home],
  );

  const isHomeActive = config.home.end
    ? pathname === config.home.to
    : pathname === config.home.to || pathname.startsWith(config.home.to + "/");

  const activeIdx = useMemo(() => {
    if (isHomeActive) return 2;
    let best = -1;
    let bestLen = -1;
    slots.forEach((s, i) => {
      if (s.kind !== "link") return;
      const leaf = s.item;
      const match = leaf.end
        ? pathname === leaf.to
        : pathname === leaf.to || pathname.startsWith(leaf.to + "/");
      if (match && leaf.to.length > bestLen) {
        best = i;
        bestLen = leaf.to.length;
      }
    });
    return best;
  }, [pathname, slots, isHomeActive]);

  useEffect(() => {
    if (activeIdx < 0 || isHomeActive || !navRef.current) {
      setIndicator(null);
      return;
    }
    const el = slotRefs.current[activeIdx];
    const parent = navRef.current;
    if (!el || !parent) return;
    const pr = parent.getBoundingClientRect();
    const er = el.getBoundingClientRect();
    setIndicator({ left: er.left - pr.left + er.width / 2 - 14, width: 28 });
  }, [activeIdx, pathname, isHomeActive]);

  const usedRoutes = new Set([shortcutA.to, shortcutB.to]);

  return (
    <>
      <nav
        ref={navRef}
        role="tablist"
        className="fixed bottom-0 left-0 right-0 z-50 md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="relative" style={{ height: NAV_HEIGHT }}>
          <BottomNavShape height={NAV_HEIGHT} />

          {indicator && (
            <span
              aria-hidden
              className="absolute top-0 h-[3px] rounded-full bg-primary transition-all duration-300 ease-out"
              style={{ left: indicator.left, width: indicator.width }}
            />
          )}

          <div className="relative flex items-end justify-around h-full px-1">
            {slots.map((slot, idx) => (
              <div
                key={idx}
                ref={(el) => { slotRefs.current[idx] = el; }}
                className="flex-1 flex items-stretch justify-center"
              >
                <SlotRenderer
                  slot={slot}
                  module={activeModule}
                  onOpenCustomizer={(s) => setCustomizerSlot(s)}
                />
              </div>
            ))}
          </div>
        </div>
      </nav>

      <ShortcutCustomizer
        slot={customizerSlot}
        onOpenChange={(open) => { if (!open) setCustomizerSlot(null); }}
        currentTo={customizerSlot === "a" ? shortcutA.to : shortcutB.to}
        options={options}
        disabledRoutes={usedRoutes}
        onPick={(to) => {
          if (!customizerSlot) return;
          setShortcut(customizerSlot, to);
          const picked = options.find((o) => o.to === to);
          if (picked) toast.success(`Atalho: ${picked.label}`);
          haptic(15);
          setCustomizerSlot(null);
        }}
      />
    </>
  );
}

const LONG_PRESS_MS = 550;

function SlotRenderer({
  slot,
  module: mod,
  onOpenCustomizer,
}: {
  slot: SlotDef;
  module: ActiveModule;
  onOpenCustomizer: (slot: ShortcutSlot) => void;
}) {
  const config = MODULE_NAV[mod] ?? MODULE_NAV.financeiro;

  if (slot.kind === "home") {
    return <HomeSlot leaf={slot.item} />;
  }

  if (slot.kind === "more") {
    return <MoreSlot to={config.moreTo} />;
  }

  return (
    <LeafSlot
      leaf={slot.item}
      onLongPress={slot.longPressSlot ? () => onOpenCustomizer(slot.longPressSlot!) : undefined}
    />
  );
}

function HomeSlot({ leaf }: { leaf: NavLeaf }) {
  const Icon = leaf.icon;
  return (
    <div className="flex items-start justify-center pt-1 w-full">
      <NavLink
        to={leaf.to}
        end={leaf.end}
        role="tab"
        onClick={() => haptic(10)}
        className={cn(
          "flex flex-col items-center justify-center gap-0.5 h-14 w-14 -mt-7 rounded-full",
          "bg-primary text-primary-foreground",
          "ring-4 ring-background",
          "shadow-[0_10px_24px_-6px_hsl(var(--primary)/0.5)]",
          "active:scale-90 transition-transform duration-150",
        )}
        aria-label={leaf.label}
      >
        <Icon className="h-6 w-6" strokeWidth={2.5} />
      </NavLink>
    </div>
  );
}

function LeafSlot({ leaf, onLongPress }: { leaf: NavLeaf; onLongPress?: () => void }) {
  const Icon = leaf.icon;
  const timerRef = useRef<number | null>(null);
  const longPressedRef = useRef(false);

  const startPress = () => {
    if (!onLongPress) return;
    longPressedRef.current = false;
    timerRef.current = window.setTimeout(() => {
      longPressedRef.current = true;
      haptic(15);
      onLongPress();
    }, LONG_PRESS_MS);
  };
  const cancelPress = () => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  return (
    <NavLink
      to={leaf.to}
      end={leaf.end}
      role="tab"
      onPointerDown={startPress}
      onPointerUp={cancelPress}
      onPointerLeave={cancelPress}
      onPointerCancel={cancelPress}
      onClick={(e) => {
        if (longPressedRef.current) {
          longPressedRef.current = false;
          e.preventDefault();
          return;
        }
        haptic(8);
      }}
      className={cn(
        "flex-1 flex flex-col items-center justify-center gap-0.5 min-h-[44px] py-1.5",
        "text-muted-foreground active:scale-95 transition-all",
      )}
      activeClassName="text-primary"
    >
      <Icon className="h-5 w-5" />
      <span className="text-[10px] font-medium leading-none text-center px-0.5 max-w-full truncate">
        {leaf.label}
      </span>
    </NavLink>
  );
}

function ShortcutCustomizer({
  slot,
  onOpenChange,
  currentTo,
  options,
  disabledRoutes,
  onPick,
}: {
  slot: ShortcutSlot | null;
  onOpenChange: (o: boolean) => void;
  currentTo: string;
  options: NavLeaf[];
  disabledRoutes: Set<string>;
  onPick: (to: string) => void;
}) {
  const open = slot !== null;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl p-0 md:hidden">
        <SheetHeader className="px-5 pt-5 pb-3 border-b">
          <SheetTitle className="flex items-center gap-2 text-left">
            <Sliders className="h-4 w-4" />
            Personalizar atalho {slot === "a" ? "esquerdo" : "direito"}
          </SheetTitle>
          <p className="text-xs text-muted-foreground text-left">
            Escolha qual funcionalidade fica no {slot === "a" ? "2º" : "4º"} slot da barra inferior.
          </p>
        </SheetHeader>
        <div className="p-4 max-h-[60vh] overflow-y-auto">
          <div className="rounded-xl border bg-card overflow-hidden">
            {options.map((opt, i) => {
              const Icon = opt.icon;
              const active = opt.to === currentTo;
              const disabled = !active && disabledRoutes.has(opt.to);
              return (
                <button
                  key={opt.to}
                  onClick={() => !disabled && onPick(opt.to)}
                  disabled={disabled}
                  className={cn(
                    "w-full min-h-11 flex items-center gap-3 px-4 py-3 text-left transition-all",
                    i > 0 && "border-t",
                    active && "bg-primary/10 text-primary",
                    disabled && "opacity-40 cursor-not-allowed",
                    !active && !disabled && "hover:bg-muted/50 active:scale-[0.98]",
                  )}
                >
                  <Icon className="h-5 w-5 shrink-0" />
                  <span className="text-sm font-medium flex-1">{opt.label}</span>
                  {active && (
                    <span className="text-[10px] font-semibold uppercase tracking-wider">Atual</span>
                  )}
                  {disabled && (
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Em uso
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
