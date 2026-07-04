import * as React from "react";
import { LucideIcon, TrendingUp, TrendingDown } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type Tone = "default" | "success" | "destructive" | "warning" | "info";

interface KpiCardProps {
  label: string;
  value: React.ReactNode;
  icon?: LucideIcon;
  /** Ex: "12% das Receitas" */
  hint?: React.ReactNode;
  /** Delta numérico exibido com seta (positivo/negativo) */
  delta?: number;
  deltaLabel?: string;
  tone?: Tone;
  loading?: boolean;
  className?: string;
  onClick?: () => void;
}

const toneIcon: Record<Tone, string> = {
  default: "text-muted-foreground",
  success: "text-success",
  destructive: "text-destructive",
  warning: "text-warning",
  info: "text-primary",
};

/**
 * KpiCard — Card padronizado para KPIs no Dashboard e Relatórios.
 * Suporta loading, delta com seta e tons semânticos.
 */
export function KpiCard({
  label,
  value,
  icon: Icon,
  hint,
  delta,
  deltaLabel,
  tone = "default",
  loading,
  className,
  onClick,
}: KpiCardProps) {
  const isClickable = !!onClick;
  const showDelta = typeof delta === "number";
  const deltaPositive = showDelta && delta! >= 0;

  return (
    <Card
      className={cn(
        "shadow-sm transition-colors",
        isClickable &&
          "cursor-pointer hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        className
      )}
      onClick={onClick}
      role={isClickable ? "button" : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onKeyDown={(e) => {
        if (isClickable && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onClick?.();
        }
      }}
    >
      <CardContent className="p-4 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs sm:text-sm font-medium text-muted-foreground truncate">
            {label}
          </span>
          {Icon && (
            <Icon
              className={cn("h-4 w-4 shrink-0", toneIcon[tone])}
              aria-hidden="true"
            />
          )}
        </div>
        {loading ? (
          <Skeleton className="h-7 w-24" />
        ) : (
          <div className="text-xl sm:text-2xl font-bold tracking-tight tabular-nums">
            {value}
          </div>
        )}
        {(showDelta || hint) && !loading && (
          <div className="flex items-center gap-1 text-xs">
            {showDelta && (
              <span
                className={cn(
                  "inline-flex items-center gap-0.5 font-medium",
                  deltaPositive ? "text-success" : "text-destructive"
                )}
              >
                {deltaPositive ? (
                  <TrendingUp className="h-3 w-3" aria-hidden="true" />
                ) : (
                  <TrendingDown className="h-3 w-3" aria-hidden="true" />
                )}
                {Math.abs(delta!).toFixed(1)}%
                {deltaLabel && (
                  <span className="text-muted-foreground font-normal ml-1">
                    {deltaLabel}
                  </span>
                )}
              </span>
            )}
            {hint && !showDelta && (
              <span className="text-muted-foreground">{hint}</span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
