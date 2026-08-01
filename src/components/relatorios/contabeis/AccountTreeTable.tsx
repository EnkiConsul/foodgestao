import { useMemo, useState } from "react";
import { ChevronRight, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ReportNode } from "@/hooks/useContabeisReport";
import { brlAcc, pct, signClass, dreSign } from "@/lib/format-contabil";

interface Props {
  nodes: ReportNode[];
  /** Se definido, mostra apenas nós cujo root_code está na lista. */
  filterRoots?: string[];
  /** Base para % AV (Análise Vertical). Se ausente, esconde a coluna. */
  avBase?: number;
  /** Handler ao clicar em folha analítica → abre razão. */
  onSelectAnalytic?: (node: ReportNode) => void;
  /** Colapsa tudo por padrão. */
  defaultCollapsed?: boolean;
}

type Tree = ReportNode & { children: Tree[] };

function buildTree(rows: ReportNode[]): Tree[] {
  const map = new Map<string, Tree>();
  rows.forEach((r) => map.set(r.id, { ...r, children: [] }));
  const roots: Tree[] = [];
  map.forEach((n) => {
    if (n.parent_id && map.has(n.parent_id)) map.get(n.parent_id)!.children.push(n);
    else roots.push(n);
  });
  const sortRec = (arr: Tree[]) => {
    arr.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
    arr.forEach((n) => sortRec(n.children));
  };
  sortRec(roots);
  return roots;
}

export function AccountTreeTable({
  nodes,
  filterRoots,
  avBase,
  onSelectAnalytic,
  defaultCollapsed = false,
}: Props) {
  const filtered = useMemo(
    () => (filterRoots ? nodes.filter((n) => filterRoots.includes(n.root_code)) : nodes),
    [nodes, filterRoots]
  );
  const tree = useMemo(() => buildTree(filtered), [filtered]);

  const [expanded, setExpanded] = useState<Set<string>>(() => {
    if (defaultCollapsed) return new Set();
    // Expande até nível 2 por padrão
    const s = new Set<string>();
    filtered.forEach((n) => {
      if (n.level <= 2) s.add(n.id);
    });
    return s;
  });

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const expandAll = () => setExpanded(new Set(filtered.map((n) => n.id)));
  const collapseAll = () => setExpanded(new Set());

  const renderRow = (node: Tree, depth: number) => {
    const hasChildren = node.children.length > 0;
    const isOpen = expanded.has(node.id);
    // Saldo vem com sinal bruto (entrada +, saída -). Normalizamos por natureza
    // para exibir custos/despesas em magnitude positiva (padrão contábil).
    const valor = Number(node.saldo_consolidado || 0) * dreSign(node);
    const av = avBase && avBase !== 0 ? (Math.abs(valor) / Math.abs(avBase)) * 100 : null;


    return (
      <div key={node.id}>
        <div
          data-testid="dre-account-row"
          data-code={node.code}
          className={cn(
            "flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-muted/50 border-b border-border/40 text-sm",
            depth === 0 && "font-semibold bg-muted/40",
            !node.is_active && "opacity-60"
          )}
          style={{ paddingLeft: `${depth * 18 + 8}px` }}
        >
          <button
            type="button"
            className={cn("h-5 w-5 flex items-center justify-center", !hasChildren && "invisible")}
            onClick={() => hasChildren && toggle(node.id)}
            aria-label={
              hasChildren
                ? `${isOpen ? "Recolher" : "Expandir"} conta ${node.code} ${node.name}`
                : undefined
            }
            aria-expanded={hasChildren ? isOpen : undefined}
            aria-hidden={hasChildren ? undefined : true}
            tabIndex={hasChildren ? undefined : -1}
          >
            {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
          <span className="font-mono text-xs text-muted-foreground w-20 shrink-0">{node.code}</span>
          <button
            type="button"
            className={cn(
              "flex-1 text-left truncate",
              node.is_analytic && onSelectAnalytic && "hover:text-primary hover:underline"
            )}
            onClick={() => node.is_analytic && onSelectAnalytic?.(node)}
            title={node.name}
          >
            {node.name}
          </button>
          {!node.is_active && (
            <Badge variant="outline" className="text-[10px]">
              inativa
            </Badge>
          )}
          {av !== null && (
            <span className="w-16 text-right text-xs text-muted-foreground tabular-nums">
              {pct(av)}
            </span>
          )}
          <span
            className={cn(
              "w-32 text-right tabular-nums font-medium",
              signClass(Number(node.saldo_consolidado || 0))
            )}
          >
            {brlAcc(valor)}
          </span>

        </div>
        {isOpen && hasChildren && node.children.map((c) => renderRow(c, depth + 1))}
      </div>
    );
  };

  if (tree.length === 0) {
    return (
      <div className="p-10 text-center text-sm text-muted-foreground">
        Nenhuma conta com movimento no período. Ajuste os filtros ou ative "Incluir contas sem
        movimento".
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={expandAll}>
          Expandir tudo
        </Button>
        <Button variant="ghost" size="sm" onClick={collapseAll}>
          Recolher tudo
        </Button>
      </div>
      <div className="rounded-md border">
        <div className="flex items-center gap-2 py-2 px-2 border-b bg-muted/60 text-xs font-medium text-muted-foreground">
          <span className="h-5 w-5 shrink-0" />
          <span className="font-mono w-20 shrink-0">Código</span>
          <span className="flex-1">Conta</span>
          {avBase !== undefined && <span className="w-16 text-right">% AV</span>}
          <span className="w-32 text-right">Valor</span>
        </div>
        {tree.map((n) => renderRow(n, 0))}
      </div>
    </div>
  );
}
