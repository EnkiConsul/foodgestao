import { useLocation, useNavigate } from "react-router-dom";
import { LayoutGrid, MoreHorizontal, Sliders } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useActiveModule, type ActiveModule } from "@/hooks/useActiveModule";
import { MODULE_NAV, type NavLeaf } from "@/config/mobileNav";
import { useModuleShortcut } from "@/hooks/useModuleShortcut";
import { MobileFab } from "./MobileFab";
import { MobileMoreSheet } from "./MobileMoreSheet";
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

type SlotKind = "hub" | "home" | "fab" | "shortcut" | "more";

type SlotDef =
  | { kind: "hub"; item: NavLeaf }
  | { kind: "home"; item: NavLeaf }
  | { kind: "fab" }
  | { kind: "shortcut"; item: NavLeaf }
  | { kind: "more" };

export function MobileBottomNav() {
  const activeModule = useActiveModule();
  const { pathname } = useLocation();
  const navRef = useRef<HTMLElement | null>(null);
  const slotRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null);

  const config = MODULE_NAV[activeModule] ?? MODULE_NAV.financeiro;
  const { shortcut, setShortcut, options } = useModuleShortcut(activeModule);
  const [customizerOpen, setCustomizerOpen] = useState(false);

  const hubLeaf: NavLeaf = useMemo(
    () => ({ icon: LayoutGrid, label: "Hub", to: config.hubTo, end: true }),
    [config.hubTo],
  );

  const slots: SlotDef[] = useMemo(
    () => [
      { kind: "hub", item: hubLeaf },
      { kind: "home", item: config.home },
      { kind: "fab" },
      { kind: "shortcut", item: shortcut },
      { kind: "more" },
    ],
    [hubLeaf, config.home, shortcut],
  );

  // Find active leaf for indicator (skip fab/more slots).
  const activeIdx = useMemo(() => {
    let best = -1;
    let bestLen = -1;
    slots.forEach((s, i) => {
      if (s.kind === "fab" || s.kind === "more") return;
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
  }, [pathname, slots]);

  useEffect(() => {
    if (activeIdx < 0 || !navRef.current) {
      setIndicator(null);
      return;
    }
    const el = slotRefs.current[activeIdx];
    const parent = navRef.current;
    if (!el || !parent) return;
    const pr = parent.getBoundingClientRect();
    const er = el.getBoundingClientRect();
    setIndicator({ left: er.left - pr.left + er.width / 2 - 14, width: 28 });
  }, [activeIdx, pathname]);

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
                  hasFab={Boolean(config.fab)}
                  onOpenCustomizer={() => setCustomizerOpen(true)}
                />
              </div>
            ))}
          </div>
        </div>
      </nav>

      <ShortcutCustomizer
        open={customizerOpen}
        onOpenChange={setCustomizerOpen}
        currentTo={shortcut.to}
        options={options}
        onPick={(to) => {
          setShortcut(to);
          setCustomizerOpen(false);
          const picked = options.find((o) => o.to === to);
          if (picked) toast.success(`Atalho: ${picked.label}`);
          haptic(15);
        }}
      />
    </>
  );
}

const LONG_PRESS_MS = 550;

function SlotRenderer({
  slot,
  module: mod,
  hasFab,
  onOpenCustomizer,
}: {
  slot: SlotDef;
  module: ActiveModule;
  hasFab: boolean;
  onOpenCustomizer: () => void;
}) {
  const config = MODULE_NAV[mod] ?? MODULE_NAV.financeiro;

  if (slot.kind === "fab") {
    if (!hasFab) {
      // Espaçador invisível para preservar simetria do notch.
      return <div aria-hidden className="w-14 h-14 -mt-7 opacity-0 pointer-events-none" />;
    }
    return (
      <div className="flex items-start justify-center pt-1 w-full">
        <MobileFab config={{ type: "fab", icon: config.fab!.icon, label: config.fab!.label, fallbackTo: config.fab!.fallbackTo }} />
      </div>
    );
  }

  if (slot.kind === "more") {
    return (
      <MobileMoreSheet
        groups={config.moreGroups}
        onCustomizeShortcut={onOpenCustomizer}
        trigger={
          <button
            type="button"
            onClick={() => haptic(6)}
            className="flex-1 flex flex-col items-center justify-center gap-0.5 min-h-[44px] py-1.5 text-muted-foreground hover:text-foreground active:scale-95 transition-all"
            aria-label="Mais opções"
          >
            <MoreHorizontal className="h-5 w-5" />
            <span className="text-[10px] font-medium leading-none">Mais</span>
          </button>
        }
      />
    );
  }

  // hub / home / shortcut → link
  return <LeafSlot leaf={slot.item} onLongPress={slot.kind === "shortcut" ? onOpenCustomizer : undefined} />;
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
  open,
  onOpenChange,
  currentTo,
  options,
  onPick,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  currentTo: string;
  options: NavLeaf[];
  onPick: (to: string) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl p-0 md:hidden">
        <SheetHeader className="px-5 pt-5 pb-3 border-b">
          <SheetTitle className="flex items-center gap-2 text-left">
            <Sliders className="h-4 w-4" />
            Personalizar atalho da barra
          </SheetTitle>
          <p className="text-xs text-muted-foreground text-left">
            Escolha qual funcionalidade fica no 4º slot da barra inferior neste módulo.
          </p>
        </SheetHeader>
        <div className="p-4 max-h-[60vh] overflow-y-auto">
          <div className="rounded-xl border bg-card overflow-hidden">
            {options.map((opt, i) => {
              const Icon = opt.icon;
              const active = opt.to === currentTo;
              return (
                <button
                  key={opt.to}
                  onClick={() => onPick(opt.to)}
                  className={cn(
                    "w-full min-h-11 flex items-center gap-3 px-4 py-3 text-left active:scale-[0.98] transition-all",
                    i > 0 && "border-t",
                    active ? "bg-primary/10 text-primary" : "hover:bg-muted/50",
                  )}
                >
                  <Icon className="h-5 w-5 shrink-0" />
                  <span className="text-sm font-medium flex-1">{opt.label}</span>
                  {active && <span className="text-[10px] font-semibold uppercase tracking-wider">Atual</span>}
                </button>
              );
            })}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
