import { NavLink } from "@/components/NavLink";
import { useActiveModule } from "@/hooks/useActiveModule";
import { MOBILE_NAV, MODULES_WITHOUT_BOTTOM_NAV, type NavSlot } from "@/config/mobileNav";
import { MobileFab } from "./MobileFab";
import { MobileMoreSheet } from "./MobileMoreSheet";
import { cn } from "@/lib/utils";

export function MobileBottomNav() {
  const activeModule = useActiveModule();
  if (MODULES_WITHOUT_BOTTOM_NAV.includes(activeModule)) return null;

  const config = MOBILE_NAV[activeModule] ?? MOBILE_NAV.financeiro!;
  const slots = config.bottom;

  return (
    <nav
      role="tablist"
      className="fixed bottom-0 left-0 right-0 z-50 border-t bg-card md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="flex items-end justify-around h-16 px-1">
        {slots.map((slot, idx) => (
          <SlotRenderer key={idx} slot={slot} moreGroups={config.moreGroups} />
        ))}
      </div>
    </nav>
  );
}

function SlotRenderer({ slot, moreGroups }: { slot: NavSlot; moreGroups: ReturnType<typeof groupsRef> }) {
  if (slot.type === "fab") {
    return (
      <div className="flex-1 flex items-start justify-center pt-1">
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
            className="flex-1 flex flex-col items-center justify-center gap-0.5 min-h-[44px] py-1.5 text-muted-foreground hover:text-foreground transition-colors"
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
      className={cn(
        "flex-1 flex flex-col items-center justify-center gap-0.5 min-h-[44px] py-1.5",
        "text-muted-foreground transition-all",
      )}
      activeClassName="text-primary -translate-y-0.5"
    >
      <Icon className="h-5 w-5" />
      <span className="text-[10px] font-medium leading-none text-center px-0.5">{slot.label}</span>
    </NavLink>
  );
}

// helper type only
function groupsRef() {
  return [] as never;
}
