import type { ReactNode } from "react";
import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DpActionsMenu, type DpAction } from "@/components/dp/DpActions";

/**
 * Alterna tabela (desktop) e lista de cartões (mobile) sem duplicar lógica de tela.
 * Regra do módulo: até 3 colunas simples a tabela pode permanecer no mobile;
 * 4+ colunas ou ações compostas usam cartões.
 */
export function DpDataList({
  table,
  cards,
  className,
}: {
  table: ReactNode;
  cards: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <div className="hidden md:block">{table}</div>
      <div className="space-y-3 md:hidden">{cards}</div>
    </div>
  );
}

/**
 * Cartão padrão de lista no mobile: título, apoio, selos e ações [Ver] + menu.
 */
export function DpListCard({
  title,
  subtitle,
  meta,
  badges,
  onOpen,
  openLabel = "Ver",
  actions = [],
  children,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Linhas curtas de apoio (cargo, unidade, período…). */
  meta?: ReactNode;
  /** Selos de situação/regime. */
  badges?: ReactNode;
  onOpen?: () => void;
  openLabel?: string;
  actions?: DpAction[];
  children?: ReactNode;
  className?: string;
}) {
  const menuActions = actions.filter((a) => !a.hidden);
  return (
    <div className={cn("min-w-0 space-y-3 rounded-2xl border border-border bg-card p-4", className)}>
      <div
        className={cn("min-w-0 space-y-1", onOpen && "cursor-pointer")}
        onClick={onOpen}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="truncate font-semibold uppercase">{title}</div>
            {subtitle && <div className="mt-0.5 truncate text-xs text-muted-foreground">{subtitle}</div>}
          </div>
        </div>
        {meta && <div className="text-sm text-muted-foreground">{meta}</div>}
        {badges && <div className="flex flex-wrap gap-1.5 pt-1">{badges}</div>}
        {children}
      </div>

      {(onOpen || menuActions.length > 0) && (
        <div
          className="flex items-center gap-2 border-t border-border/60 pt-3"
          onClick={(e) => e.stopPropagation()}
        >
          {onOpen && (
            <Button variant="outline" className="min-h-11 flex-1 rounded-full" onClick={onOpen}>
              <Eye className="mr-1.5 h-4 w-4" /> {openLabel}
            </Button>
          )}
          {menuActions.length > 0 && <DpActionsMenu actions={menuActions} vertical />}
        </div>
      )}
    </div>
  );
}
