import { createContext, useContext, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { toTitleCase } from "@/lib/titleCase";
import { DpActions, type DpAction } from "@/components/dp/DpActions";

/**
 * Quando uma tela é renderizada dentro de outra (como aba), o wrapper
 * `DpPage` deixa de aplicar largura máxima e o `DpPageHeader` mostra apenas
 * as ações — o título fica a cargo da tela hospedeira.
 */
const DpEmbeddedContext = createContext(false);

export function DpEmbeddedProvider({ children }: { children: ReactNode }) {
  return <DpEmbeddedContext.Provider value={true}>{children}</DpEmbeddedContext.Provider>;
}

export function useDpEmbedded() {
  return useContext(DpEmbeddedContext);
}

interface DpPageProps {
  children: ReactNode;
  className?: string;
  narrow?: boolean;
}

export function DpPage({ children, className, narrow = false }: DpPageProps) {
  const embedded = useDpEmbedded();
  if (embedded) {
    return <div className={cn("dp-page-embedded space-y-4 md:space-y-6 w-full", className)}>{children}</div>;
  }
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
  /** Ações livres (compatibilidade) ou uma `<DpActions />`. */
  actions?: ReactNode;
  /** Lista de ações no padrão do módulo — mobile mostra principal + "Mais". */
  actionItems?: DpAction[];
  /** Controles avulsos exibidos só no desktop (ex.: salvar larguras). */
  actionsExtra?: ReactNode;
  className?: string;
  /** Classe extra do container de ações (ex.: manter ações na mesma linha do título no mobile). */
  actionsClassName?: string;
}

function HeaderActions({
  actions, actionItems, actionsExtra, actionsClassName,
}: Pick<DpPageHeaderProps, "actions" | "actionItems" | "actionsExtra" | "actionsClassName">) {
  if (actionItems && actionItems.length > 0) {
    return <DpActions actions={actionItems} extra={actionsExtra} />;
  }
  if (!actions) return null;
  return (
    <div className={cn("dp-page-actions flex w-full flex-wrap items-center gap-2 sm:w-auto sm:shrink-0 sm:justify-end [&>*]:min-h-11", actionsClassName)}>
      {actions}
    </div>
  );
}

export function DpPageHeader({
  icon: Icon, title, description, actions, actionItems, actionsExtra, className,
}: DpPageHeaderProps) {
  const embedded = useDpEmbedded();
  const temAcoes = Boolean(actions || (actionItems && actionItems.length > 0));
  if (embedded) {
    return (
      <header className={cn("dp-page-header-embedded flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between", className)}>
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-base font-semibold leading-tight sm:text-lg">
            <Icon className="h-4 w-4 shrink-0 text-primary" />
            {toTitleCase(title)}
          </h2>
          {description && <p className="mt-0.5 text-xs text-muted-foreground sm:text-sm">{description}</p>}
        </div>
        {temAcoes && <HeaderActions actions={actions} actionItems={actionItems} actionsExtra={actionsExtra} />}
      </header>
    );
  }
  return (
    <header className={cn("dp-page-header flex flex-col gap-3 sm:gap-4 sm:flex-row sm:items-center sm:justify-between", className)}>
      <div className="flex min-w-0 items-start gap-2 sm:gap-3">
        <Icon className="mt-0.5 h-5 w-5 shrink-0 text-primary sm:mt-1 sm:h-7 sm:w-7" />
        <div className="min-w-0">
          <h1 className="text-lg font-bold leading-tight tracking-normal sm:text-2xl md:text-3xl">{toTitleCase(title)}</h1>
          {description && (
            <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground sm:mt-1 sm:line-clamp-none sm:text-sm">{description}</p>
          )}
        </div>
      </div>
      {temAcoes && <HeaderActions actions={actions} actionItems={actionItems} actionsExtra={actionsExtra} />}
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
    <Card className={cn("dp-content-card min-w-0", className)}>
      <CardContent className={cn("p-0 min-w-0", contentClassName)}>{children}</CardContent>
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
