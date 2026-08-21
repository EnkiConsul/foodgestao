import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { toTitleCase } from "@/lib/titleCase";

interface DpPageProps {
  children: ReactNode;
  className?: string;
  narrow?: boolean;
}

export function DpPage({ children, className, narrow = false }: DpPageProps) {
  return (
    <div className={cn("dp-page space-y-4 md:space-y-6 mx-auto w-full", narrow ? "max-w-5xl" : "max-w-7xl", className)}>
      {children}
    </div>
  );
}

interface DpPageHeaderProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
}

export function DpPageHeader({ icon: Icon, title, description, actions, className }: DpPageHeaderProps) {
  return (
    <header className={cn("dp-page-header flex flex-col gap-2 sm:gap-4 sm:flex-row sm:items-center sm:justify-between", className)}>
      <div className="flex min-w-0 items-start gap-2 sm:gap-3">
        <Icon className="mt-0.5 h-5 w-5 shrink-0 text-primary sm:mt-1 sm:h-7 sm:w-7" />
        <div className="min-w-0">
          <h1 className="text-lg font-bold leading-tight tracking-normal sm:text-2xl md:text-3xl">{toTitleCase(title)}</h1>
          {description && (
            <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground sm:mt-1 sm:line-clamp-none sm:text-sm">{description}</p>
          )}
        </div>
      </div>
      {actions && (
        <div className="dp-page-actions -mx-3 flex shrink-0 items-center gap-2 overflow-x-auto px-3 pb-0.5 [scrollbar-width:none] [&>*]:shrink-0 [&::-webkit-scrollbar]:hidden sm:mx-0 sm:flex-wrap sm:justify-end sm:overflow-visible sm:px-0">
          {actions}
        </div>
      )}
    </header>
  );
}

interface DpFilterCardProps {
  children: ReactNode;
  className?: string;
}

export function DpFilterCard({ children, className }: DpFilterCardProps) {
  return (
    <Card className={cn("dp-filter-card", className)}>
      <CardContent className="p-4 md:p-5">{children}</CardContent>
    </Card>
  );
}

interface DpContentCardProps {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}

export function DpContentCard({ children, className, contentClassName }: DpContentCardProps) {
  return (
    <Card className={cn("dp-content-card", className)}>
      <CardContent className={cn("p-0", contentClassName)}>{children}</CardContent>
    </Card>
  );
}

interface DpEmptyStateProps {
  icon?: LucideIcon;
  children: ReactNode;
  className?: string;
  /** Adiciona borda tracejada arredondada — padrão da doc de referência. */
  dashed?: boolean;
  /** Raio da borda quando `dashed` (default: '2xl'). */
  radius?: "xl" | "2xl" | "3xl";
}

const RADIUS_CLASS = {
  xl: "rounded-xl",
  "2xl": "rounded-2xl",
  "3xl": "rounded-3xl",
} as const;

export function DpEmptyState({
  icon: Icon,
  children,
  className,
  dashed = false,
  radius = "2xl",
}: DpEmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 py-10 text-center text-sm text-muted-foreground",
        dashed && "border-2 border-dashed border-border/70 bg-muted/30 px-6",
        dashed && RADIUS_CLASS[radius],
        className,
      )}
    >
      {Icon && <Icon className="h-8 w-8 opacity-40" />}
      <div>{children}</div>
    </div>
  );
}
