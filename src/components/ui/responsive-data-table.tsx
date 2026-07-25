import * as React from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

export interface ResponsiveColumn<T> {
  key: string;
  header: React.ReactNode;
  cell: (row: T) => React.ReactNode;
  className?: string;
  headerClassName?: string;
  /** Se true, esconde a coluna no tablet/mobile (usa hidden md:table-cell). */
  hideOnMobile?: boolean;
}

interface ResponsiveDataTableProps<T> {
  columns: ResponsiveColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  renderMobileCard: (row: T) => React.ReactNode;
  onRowClick?: (row: T) => void;
  loading?: boolean;
  emptyState?: React.ReactNode;
  className?: string;
  /** Wrapper visual da tabela desktop. Default estilo card. */
  wrapperClassName?: string;
}

/**
 * Tabela responsiva:
 * - Desktop (>= md): tabela padrão.
 * - Mobile (< md): lista de cards renderizada por `renderMobileCard`.
 */
export function ResponsiveDataTable<T>({
  columns,
  rows,
  rowKey,
  renderMobileCard,
  onRowClick,
  loading,
  emptyState,
  className,
  wrapperClassName,
}: ResponsiveDataTableProps<T>) {
  const isMobile = useIsMobile();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Carregando…
      </div>
    );
  }

  if (!rows.length) {
    return (
      <div className="rounded-2xl border bg-card p-8 text-center text-sm text-muted-foreground">
        {emptyState ?? "Nenhum registro encontrado."}
      </div>
    );
  }

  if (isMobile) {
    return (
      <div className={cn("space-y-3", className)}>
        {rows.map((row) => (
          <div
            key={rowKey(row)}
            role={onRowClick ? "button" : undefined}
            tabIndex={onRowClick ? 0 : undefined}
            onClick={() => onRowClick?.(row)}
            onKeyDown={(e) => {
              if (!onRowClick) return;
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onRowClick(row);
              }
            }}
            className={cn(
              "rounded-xl border bg-card p-3 shadow-sm transition-transform",
              onRowClick && "cursor-pointer active:scale-[0.98] hover:bg-muted/40",
            )}
          >
            {renderMobileCard(row)}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "hidden md:block overflow-hidden rounded-2xl border bg-card shadow-sm",
        wrapperClassName,
      )}
    >
      <table className="w-full text-sm">
        <thead className="bg-muted/40">
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                className={cn(
                  "p-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground",
                  col.hideOnMobile && "hidden md:table-cell",
                  col.headerClassName,
                )}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              onClick={() => onRowClick?.(row)}
              className={cn(
                "border-t transition-colors",
                onRowClick && "cursor-pointer hover:bg-muted/40",
              )}
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={cn(
                    "p-3 align-middle",
                    col.hideOnMobile && "hidden md:table-cell",
                    col.className,
                  )}
                >
                  {col.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
