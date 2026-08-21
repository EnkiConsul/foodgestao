import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface DpStatCardProps {
  icon?: LucideIcon;
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  /** Tom do ícone — usa tokens semânticos. */
  tone?: "primary" | "muted" | "success" | "warning" | "danger";
  onClick?: () => void;
  className?: string;
}

const TONE: Record<NonNullable<DpStatCardProps["tone"]>, string> = {
  primary: "bg-primary/10 text-primary",
  muted: "bg-muted text-muted-foreground",
  success: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  warning: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  danger: "bg-destructive/10 text-destructive",
};

/**
 * Card de indicador padrão do módulo Pessoas.
 * Altura uniforme, rótulo em no máximo 2 linhas e ícone sempre no mesmo canto —
 * evita o desalinhamento observado no mobile entre cards da mesma linha.
 */
export function DpStatCard({
  icon: Icon,
  label,
  value,
  hint,
  tone = "primary",
  onClick,
  className,
}: DpStatCardProps) {
  const Comp = onClick ? "button" : "div";
  return (
    <Card
      className={cn(
        "h-full overflow-hidden",
        onClick && "transition-colors hover:bg-muted/40",
        className,
      )}
    >
      <Comp
        type={onClick ? "button" : undefined}
        onClick={onClick}
        className={cn("flex h-full w-full items-start gap-2.5 p-3 text-left sm:p-4")}
      >
        {Icon && (
          <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg sm:h-9 sm:w-9", TONE[tone])}>
            <Icon className="h-4 w-4" aria-hidden="true" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-[11px] font-medium leading-tight text-muted-foreground sm:text-xs">
            {label}
          </p>
          <p className="mt-0.5 truncate text-xl font-bold leading-tight tabular-nums sm:text-2xl">
            {value}
          </p>
          {hint && (
            <p className="mt-0.5 line-clamp-2 text-[11px] leading-tight text-muted-foreground">{hint}</p>
          )}
        </div>
      </Comp>
    </Card>
  );
}

/** Grade padrão para os cards de indicador: 2 colunas no mobile. */
export function DpStatGrid({
  children,
  className,
  cols = 4,
}: {
  children: React.ReactNode;
  className?: string;
  cols?: 2 | 3 | 4;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-2 sm:gap-3",
        cols === 2 && "md:grid-cols-2",
        cols === 3 && "md:grid-cols-3",
        cols === 4 && "md:grid-cols-4",
        className,
      )}
    >
      {children}
    </div>
  );
}
