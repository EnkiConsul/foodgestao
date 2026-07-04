import * as React from "react";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  breadcrumbs?: React.ReactNode;
  className?: string;
  /** Renderiza como h1 (default) ou h2 quando reaproveitado em sub-seções */
  as?: "h1" | "h2";
}

/**
 * PageHeader — cabeçalho de página padronizado.
 * Layout mobile-first: título/descrição empilhados; ações vão para baixo (full-width no mobile).
 */
export function PageHeader({
  title,
  description,
  actions,
  breadcrumbs,
  className,
  as: Heading = "h1",
}: PageHeaderProps) {
  return (
    <header className={cn("space-y-3", className)}>
      {breadcrumbs && <div className="text-xs text-muted-foreground">{breadcrumbs}</div>}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <Heading className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
            {title}
          </Heading>
          {description && (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        {actions && (
          <div className="flex flex-wrap items-center gap-2 sm:justify-end [&>*]:min-w-0">
            {actions}
          </div>
        )}
      </div>
    </header>
  );
}
