import * as React from "react";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  secondaryAction?: React.ReactNode;
  className?: string;
  /** compact reduz paddings; use dentro de tabelas/cards menores */
  compact?: boolean;
}

/**
 * EmptyState — estado vazio padronizado.
 * Uso: <EmptyState icon={Inbox} title="Nenhum lançamento" description="..." action={<Button>...</Button>} />
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  secondaryAction,
  className,
  compact = false,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        compact ? "py-8 px-4 gap-2" : "py-12 px-6 gap-3",
        className
      )}
      role="status"
    >
      {Icon && (
        <div
          className={cn(
            "flex items-center justify-center rounded-full bg-muted/60 text-muted-foreground",
            compact ? "h-10 w-10 mb-1" : "h-14 w-14 mb-2"
          )}
        >
          <Icon className={compact ? "h-5 w-5" : "h-7 w-7"} aria-hidden="true" />
        </div>
      )}
      <h3
        className={cn(
          "font-semibold text-foreground",
          compact ? "text-sm" : "text-base"
        )}
      >
        {title}
      </h3>
      {description && (
        <p
          className={cn(
            "text-muted-foreground max-w-md",
            compact ? "text-xs" : "text-sm"
          )}
        >
          {description}
        </p>
      )}
      {(action || secondaryAction) && (
        <div className="flex flex-wrap items-center justify-center gap-2 mt-2">
          {action}
          {secondaryAction}
        </div>
      )}
    </div>
  );
}
