import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useMobileFabState } from "@/providers/MobileFabProvider";
import type { NavFab } from "@/config/mobileNav";

type Props = {
  config: NavFab;
  className?: string;
};

function haptic(ms = 12) {
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
    try { navigator.vibrate(ms); } catch { /* noop */ }
  }
}

export function MobileFab({ config, className }: Props) {
  const navigate = useNavigate();
  const registered = useMobileFabState();

  if (registered?.hidden) return null;

  const label = registered?.label || config.label;
  const Icon = config.icon;

  const handlePress = () => {
    haptic(12);
    if (registered?.onPress) {
      registered.onPress();
      return;
    }
    if (config.fallbackTo) navigate(config.fallbackTo);
  };

  return (
    <button
      type="button"
      onClick={handlePress}
      aria-label={label}
      className={cn(
        "flex items-center justify-center rounded-full",
        "h-14 w-14 -mt-7",
        "bg-primary text-primary-foreground",
        "shadow-[0_10px_24px_-6px_hsl(var(--primary)/0.5)] ring-4 ring-background",
        "active:scale-90 transition-transform duration-150",
        className,
      )}
    >
      <Icon className="h-6 w-6" strokeWidth={2.5} />
    </button>
  );
}
