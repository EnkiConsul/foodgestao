import type { ReactNode } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

export interface ResponsiveColumn<T> {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  /** Alinhamento no desktop. */
  align?: "left" | "right";
  /** Coluna usada como título do cartão no mobile. */
  primary?: boolean;
  /** Oculta a coluna no cartão mobile (dado secundário). */
  hideOnMobile?: boolean;
}

interface Props<T> {
  columns: ResponsiveColumn<T>[];
  rows: T[];
  getKey: (row: T) => string;
  empty?: ReactNode;
  className?: string;
}

/**
 * Tabela no desktop, cartões empilhados no mobile — mesma fonte de dados,
 * sem rolagem horizontal em telas pequenas.
 */
export function ResponsiveTable<T>({ columns, rows, getKey, empty, className }: Props<T>) {
  const primary = columns.find((c) => c.primary) ?? columns[0];
  const secondary = columns.filter((c) => c !== primary && !c.hideOnMobile);

  if (rows.length === 0) {
    return (
      <p className="p-4 text-sm text-muted-foreground md:p-6">
        {empty ?? "Nenhum registro no período."}
      </p>
    );
  }

  return (
    <div className={className}>
      {/* Mobile: cartões */}
      <ul className="divide-y md:hidden">
        {rows.map((row) => (
          <li key={getKey(row)} className="space-y-1.5 p-4">
            <div className="text-sm font-semibold">{primary.cell(row)}</div>
            <dl className="grid gap-1 text-xs">
              {secondary.map((col) => (
                <div key={col.key} className="flex items-start justify-between gap-3">
                  <dt className="text-muted-foreground">{col.header}</dt>
                  <dd className="text-right font-medium">{col.cell(row)}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>

      {/* Desktop: tabela */}
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((col) => (
                <TableHead
                  key={col.key}
                  className={cn(col.align === "right" && "text-right")}
                >
                  {col.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={getKey(row)}>
                {columns.map((col) => (
                  <TableCell
                    key={col.key}
                    className={cn(
                      col.align === "right" && "text-right",
                      col.primary && "font-medium",
                    )}
                  >
                    {col.cell(row)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
