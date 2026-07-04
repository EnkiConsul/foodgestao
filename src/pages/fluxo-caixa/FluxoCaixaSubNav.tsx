import { CalendarDays, CalendarRange, CalendarCheck } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type FluxoGranularity = "diario" | "semanal" | "mensal";

interface SubNavItem {
  value: FluxoGranularity;
  label: string;
  icon: LucideIcon;
}

const ITEMS: SubNavItem[] = [
  { value: "diario", label: "Diário", icon: CalendarDays },
  { value: "semanal", label: "Semanal", icon: CalendarRange },
  { value: "mensal", label: "Mensal", icon: CalendarCheck },
];

interface FluxoCaixaSubNavProps {
  value: FluxoGranularity;
  onChange: (v: FluxoGranularity) => void;
}

export function FluxoCaixaSubNav({ value, onChange }: FluxoCaixaSubNavProps) {
  return (
    <nav
      aria-label="Sub-navegação do Fluxo de Caixa"
      className="flex gap-1 overflow-x-auto border-b -mx-2 px-2 sm:mx-0 sm:px-0"
    >
      {ITEMS.map((it) => {
        const active = value === it.value;
        const Icon = it.icon;
        return (
          <button
            key={it.value}
            type="button"
            onClick={() => onChange(it.value)}
            aria-current={active ? "page" : undefined}
            aria-pressed={active}
            className={
              "inline-flex items-center gap-1.5 whitespace-nowrap px-3 py-2 text-sm font-medium border-b-2 transition-colors -mb-px " +
              (active
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-border")
            }
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            {it.label}
          </button>
        );
      })}
    </nav>
  );
}
