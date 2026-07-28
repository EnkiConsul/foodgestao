import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FluxoNode } from "@/lib/relatorios/fluxoCaixa";

interface Props {
  node: FluxoNode;
  isCollapsed: boolean;
  onToggle: (id: string) => void;
  formatBRL: (n: number) => string;
  avg: (arr: number[]) => number;
  sum: (arr: number[]) => number;
}

export function FluxoCaixaCategoryRow({ node, isCollapsed, onToggle, formatBRL, avg, sum }: Props) {
  const hasChildren = node.children.length > 0;
  const paddingLeft = 12 + node.depth * 16;
  return (
    <tr className={cn("border-b hover:bg-muted/30", hasChildren && "bg-muted/10")}>
      <td
        className={cn(
          "py-1.5 px-2 sticky left-0",
          hasChildren ? "font-semibold text-foreground cursor-pointer select-none bg-muted/10" : "text-muted-foreground bg-card"
        )}
        style={{ paddingLeft }}
        onClick={hasChildren ? () => onToggle(node.id) : undefined}
      >
        <span className="inline-flex items-center gap-1">
          {hasChildren && (
            <ChevronRight className={cn("h-3.5 w-3.5 transition-transform shrink-0", !isCollapsed && "rotate-90")} />
          )}
          
          {node.name}
        </span>
      </td>
      {node.months.map((v, i) => (
        <td
          key={i}
          className={cn(
            "text-right py-1.5 px-2 tabular-nums",
            hasChildren ? "font-medium text-foreground" : "text-foreground"
          )}
        >
          {v > 0 ? formatBRL(v) : "-"}
        </td>
      ))}
      <td className={cn("text-right py-1.5 px-2 tabular-nums", hasChildren && "font-medium")}>
        {formatBRL(avg(node.months))}
      </td>
      <td className={cn("text-right py-1.5 px-2 tabular-nums", hasChildren ? "font-bold" : "font-medium")}>
        {formatBRL(sum(node.months))}
      </td>
    </tr>
  );
}
