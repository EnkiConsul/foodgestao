import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface DpPageProps {
  children: ReactNode;
  className?: string;
  narrow?: boolean;
}

export function DpPage({ children, className, narrow = false }: DpPageProps) {
  return (
    <div className={cn("dp-page space-y-6 mx-auto w-full", narrow ? "max-w-5xl" : "max-w-7xl", className)}>
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
    <header className={cn("dp-page-header flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between", className)}>
      <div className="flex min-w-0 items-start gap-3">
        <Icon className="mt-1 h-7 w-7 shrink-0 text-primary" />
        <div className="min-w-0">
          <h1 className="text-2xl font-bold leading-tight tracking-normal md:text-3xl">{title}</h1>
          {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center justify-start gap-2 sm:justify-end">{actions}</div>}
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
