import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useMobileFabState } from "@/providers/MobileFabProvider";
import type { NavFab } from "@/config/mobileNav";

type Props = {
  config: NavFab;
  className?: string;
};

export function MobileFab({ config, className }: Props) {
  const navigate = useNavigate();
  const registered = useMobileFabState();

  if (registered?.hidden) return null;

  const label = registered?.label || config.label;
  const Icon = config.icon;

  const handlePress = () => {
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
        "h-14 w-14 -mt-6",
        "bg-primary text-primary-foreground",
        "shadow-lg shadow-primary/30 ring-4 ring-card",
        "active:scale-95 transition-transform",
        className,
      )}
    >
      <Icon className="h-6 w-6" strokeWidth={2.5} />
    </button>
  );
}
