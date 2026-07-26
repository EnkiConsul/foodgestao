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
import { haptic } from "@/lib/haptics";

const NAV_HEIGHT = 64;


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

  const isMoreActive = pathname === config.moreTo || pathname.startsWith(config.moreTo + "/");

  const activeIdx = useMemo(() => {
    if (isHomeActive) return 2;
    if (isMoreActive) return 4;
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
  }, [pathname, slots, isHomeActive, isMoreActive]);

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
        onSlotChange={(s) => setCustomizerSlot(s)}
        onOpenChange={(open) => { if (!open) setCustomizerSlot(null); }}
        currentA={shortcutA.to}
        currentB={shortcutB.to}
        options={options}
        onPick={(s, to) => {
          setShortcut(s, to);
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

function MoreSlot({ to }: { to: string }) {
  return (
    <NavLink
      to={to}
      role="tab"
      onClick={() => haptic(6)}
      className={cn(
        "flex-1 flex flex-col items-center justify-center gap-0.5 min-h-[44px] py-1.5",
        "text-muted-foreground active:scale-95 transition-all",
      )}
      activeClassName="text-primary"
      aria-label="Mais opções"
    >
      <MoreHorizontal className="h-5 w-5" />
      <span className="text-[10px] font-medium leading-none">Mais</span>
    </NavLink>
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
  onSlotChange: _onSlotChange,
  onOpenChange,
  currentA,
  currentB,
  options,
  onPick,
}: {
  slot: ShortcutSlot | null;
  onSlotChange: (s: ShortcutSlot) => void;
  onOpenChange: (o: boolean) => void;
  currentA: string;
  currentB: string;
  options: NavLeaf[];
  onPick: (slot: ShortcutSlot, to: string) => void;
}) {
  const open = slot !== null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl p-0 md:hidden">
        <SheetHeader className="px-5 pt-5 pb-3 border-b">
          <SheetTitle className="flex items-center gap-2 text-left">
            <Sliders className="h-4 w-4" />
            Personalizar Barra Inferior
          </SheetTitle>
          <p className="text-xs text-muted-foreground text-left">
            Toque nos chips <span className="font-semibold">2º</span> ou <span className="font-semibold">4º</span> ao lado de cada item para fixá-lo naquele botão da barra.
          </p>
        </SheetHeader>
        <div className="p-4 max-h-[65vh] overflow-y-auto">
          <div className="rounded-xl border bg-card overflow-hidden">
            {options.map((opt, i) => {
              const Icon = opt.icon;
              const isA = opt.to === currentA;
              const isB = opt.to === currentB;
              return (
                <div
                  key={opt.to}
                  className={cn(
                    "w-full min-h-11 flex items-center gap-3 px-4 py-2.5",
                    i > 0 && "border-t",
                    (isA || isB) && "bg-muted/40",
                  )}
                >
                  <Icon className="h-5 w-5 shrink-0 text-muted-foreground" />
                  <span className="text-sm font-medium flex-1 truncate">{opt.label}</span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <SlotChip
                      label="2º"
                      active={isA}
                      disabled={isB}
                      onClick={() => !isB && onPick("a", opt.to)}
                    />
                    <SlotChip
                      label="4º"
                      active={isB}
                      disabled={isA}
                      onClick={() => !isA && onPick("b", opt.to)}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground text-center">
            Itens já fixos em um slot ficam desabilitados no outro.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function SlotChip({
  label,
  active,
  disabled,
  onClick,
}: {
  label: string;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || active}
      className={cn(
        "inline-flex items-center justify-center h-7 min-w-[32px] px-2 rounded-md text-[11px] font-semibold border transition-colors",
        active
          ? "bg-primary text-primary-foreground border-primary"
          : disabled
            ? "opacity-40 cursor-not-allowed border-border text-muted-foreground"
            : "border-border text-foreground hover:bg-muted active:scale-95",
      )}
      aria-label={active ? `Slot ${label} atual` : `Fixar no slot ${label}`}
    >
      {label}
    </button>
  );
}
