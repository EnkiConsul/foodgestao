import { cn } from "@/lib/utils";
import { Check } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface Modulo {
  slug: string;
  name: string;
  description: string;
  icon: LucideIcon;
}

interface Props {
  modulo: Modulo;
  selected: boolean;
  onToggle: () => void;
}

export function ModuloCard({ modulo, selected, onToggle }: Props) {
  const Icon = modulo.icon;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={selected}
      className={cn(
        "group relative flex flex-col items-start gap-3 rounded-xl border-2 p-4 text-left transition-all",
        "hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        selected
          ? "border-primary bg-[hsl(var(--onboarding-accent-soft))]"
          : "border-border bg-card hover:border-primary/40",
      )}
    >
      <div className="flex w-full items-start justify-between gap-2">
        <div
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-lg transition-colors",
            selected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div
          className={cn(
            "flex h-6 w-6 items-center justify-center rounded-full border-2 transition-all",
            selected ? "border-primary bg-primary text-primary-foreground" : "border-border",
          )}
          aria-hidden
        >
          {selected && <Check className="h-3.5 w-3.5" />}
        </div>
      </div>
      <div className="space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="font-semibold text-sm">{modulo.name}</h3>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">{modulo.description}</p>
      </div>
    </button>
  );
}
