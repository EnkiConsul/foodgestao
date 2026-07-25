import { useLocation } from "react-router-dom";
import { NavLink } from "@/components/NavLink";
import { useActiveModule } from "@/hooks/useActiveModule";
import { MOBILE_NAV, MODULES_WITHOUT_BOTTOM_NAV, type NavSlot, type MoreGroup, type NavLeaf } from "@/config/mobileNav";
import { MobileFab } from "./MobileFab";
import { MobileMoreSheet } from "./MobileMoreSheet";
import { BottomNavShape } from "./BottomNavShape";
import { cn } from "@/lib/utils";
import { useEffect, useMemo, useRef, useState } from "react";

const NAV_HEIGHT = 64;

function haptic(ms = 8) {
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
    try { navigator.vibrate(ms); } catch { /* noop */ }
  }
}

export function MobileBottomNav() {
  const activeModule = useActiveModule();
  const { pathname } = useLocation();
  const navRef = useRef<HTMLElement | null>(null);
  const slotRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null);

  if (MODULES_WITHOUT_BOTTOM_NAV.includes(activeModule)) return null;

  const config = MOBILE_NAV[activeModule] ?? MOBILE_NAV.financeiro!;
  const slots = config.bottom;

  // Find active leaf slot for indicator
  const activeIdx = useMemo(() => {
    let best = -1;
    let bestLen = -1;
    slots.forEach((s, i) => {
      if (s.type === "fab" || s.type === "more") return;
      const leaf = s as NavLeaf;
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
    <nav
      ref={navRef}
      role="tablist"
      className="fixed bottom-0 left-0 right-0 z-50 md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="relative" style={{ height: NAV_HEIGHT }}>
        <BottomNavShape height={NAV_HEIGHT} />

        {/* Active indicator bar */}
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
              <SlotRenderer slot={slot} moreGroups={config.moreGroups} onNavigate={() => haptic(8)} />
            </div>
          ))}
        </div>
      </div>
    </nav>
  );
}

function SlotRenderer({
  slot,
  moreGroups,
  onNavigate,
}: {
  slot: NavSlot;
  moreGroups: MoreGroup[];
  onNavigate: () => void;
}) {
  if (slot.type === "fab") {
    return (
      <div className="flex items-start justify-center pt-1 w-full">
        <MobileFab config={slot} />
      </div>
    );
  }

  if (slot.type === "more") {
    const Icon = slot.icon;
    return (
      <MobileMoreSheet
        groups={moreGroups}
        trigger={
          <button
            type="button"
            onClick={() => haptic(6)}
            className="flex-1 flex flex-col items-center justify-center gap-0.5 min-h-[44px] py-1.5 text-muted-foreground hover:text-foreground active:scale-95 transition-all"
            aria-label={slot.label}
          >
            <Icon className="h-5 w-5" />
            <span className="text-[10px] font-medium leading-none">{slot.label}</span>
          </button>
        }
      />
    );
  }

  const Icon = slot.icon;
  return (
    <NavLink
      to={slot.to}
      end={slot.end}
      role="tab"
      onClick={onNavigate}
      className={cn(
        "flex-1 flex flex-col items-center justify-center gap-0.5 min-h-[44px] py-1.5",
        "text-muted-foreground active:scale-95 transition-all",
      )}
      activeClassName="text-primary"
    >
      <Icon className="h-5 w-5" />
      <span className="text-[10px] font-medium leading-none text-center px-0.5">{slot.label}</span>
    </NavLink>
  );
}
