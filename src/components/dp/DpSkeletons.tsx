import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface TableSkeletonProps {
  columns: number;
  rows?: number;
  headers?: string[];
}

/** Skeleton para tabelas do módulo DP enquanto os dados carregam. */
export function TableSkeleton({ columns, rows = 6, headers }: TableSkeletonProps) {
  return (
    <Table>
      {headers && (
        <TableHeader>
          <TableRow>
            {headers.map((h) => (
              <TableHead key={h}>{h}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
      )}
      <TableBody>
        {Array.from({ length: rows }).map((_, i) => (
          <TableRow key={i}>
            {Array.from({ length: columns }).map((__, j) => (
              <TableCell key={j}>
                <Skeleton className={j === 0 ? "h-4 w-40" : "h-4 w-24"} />
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/** Skeleton para o grid de calendário mensal (7 colunas × N linhas). */
export function CalendarSkeleton({ weeks = 5 }: { weeks?: number }) {
  return (
    <div className="grid grid-cols-7 gap-px bg-border rounded-md overflow-hidden border">
      {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((d) => (
        <div key={d} className="bg-muted/50 py-2 text-center text-xs font-medium text-muted-foreground">
          {d}
        </div>
      ))}
      {Array.from({ length: weeks * 7 }).map((_, i) => (
        <div key={i} className="min-h-[92px] bg-background p-1.5 space-y-1">
          <Skeleton className="h-3 w-6" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-3/4" />
        </div>
      ))}
    </div>
  );
}
