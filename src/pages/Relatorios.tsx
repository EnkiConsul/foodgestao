import { useMemo, useState, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { usePrivacy } from "@/hooks/usePrivacy";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ChevronLeft,
  ChevronRight,
  Printer,
  ChevronsUpDown,
  Filter,
  X,
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

const formatBRLRaw = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function Relatorios() {
  const { user } = useAuth();
  const { contextType, selectedCompanyId } = useCompanyContext();
  const { maskBRL } = usePrivacy();
  const formatBRL = maskBRL;
  const reportRef = useRef<HTMLDivElement>(null);
  const [fluxoYear, setFluxoYear] = useState(new Date().getFullYear());
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const [filterAccountId, setFilterAccountId] = useState<string>("all");
  const [filterCategoryId, setFilterCategoryId] = useState<string>("all");
  const [showFilters, setShowFilters] = useState(false);

  const collectParentIds = (nodes: any[]): string[] => {
    const ids: string[] = [];
    for (const n of nodes) {
      if (n.children && n.children.length > 0) {
        ids.push(n.id);
        ids.push(...collectParentIds(n.children));
      }
    }
    return ids;
  };

  const expandAll = () => setCollapsedIds(new Set());
  const collapseAll = () => {
    const allParents = [
      ...collectParentIds(fluxoCaixaData.receitaTree),
      ...collectParentIds(fluxoCaixaData.despesaTree),
    ];
    setCollapsedIds(new Set(allParents));
  };

  const toggleCollapse = (id: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const { data: categories = [] } = useQuery({
    queryKey: ["relatorios-cats", user?.id, contextType],
    enabled: !!user,
    queryFn: async () => {
      let q = supabase
        .from("categories")
        .select("id, name, color, transaction_type, parent_id, hierarchy_index, sort_order")
        .eq("user_id", user!.id);
      if (contextType === "pf") q = q.or("context.is.null,context.eq.pf");
      else q = q.or("context.is.null,context.eq.pj");
      const { data } = await q;
      return data ?? [];
    },
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ["relatorios-accounts", user?.id, contextType, selectedCompanyId],
    enabled: !!user,
    queryFn: async () => {
      let q = supabase
        .from("accounts")
        .select("id, name, account_type")
        .eq("user_id", user!.id)
        .eq("context", contextType)
        .eq("is_active", true);
      if (contextType === "pj" && selectedCompanyId) q = q.eq("company_id", selectedCompanyId);
      const { data } = await q;
      return data ?? [];
    },
  });

  // Fluxo de Caixa - full year query
  const { data: fluxoTransactions = [] } = useQuery({
    queryKey: ["relatorios-fluxo", user?.id, fluxoYear, contextType, selectedCompanyId],
    enabled: !!user,
    queryFn: async () => {
      let q = supabase
        .from("transactions")
        .select("amount, amount_paid, transaction_type, transaction_date, category_id, account_id, status, due_date")
        .eq("user_id", user!.id)
        .eq("context", contextType)
        .gte("transaction_date", `${fluxoYear}-01-01`)
        .lte("transaction_date", `${fluxoYear}-12-31`)
        .neq("status", "cancelado");
      if (contextType === "pj" && selectedCompanyId) q = q.eq("company_id", selectedCompanyId);
      const { data } = await q;
      return data ?? [];
    },
  });

  // Apply filters to transactions
  const filteredTransactions = useMemo(() => {
    let txs = fluxoTransactions;
    if (filterAccountId !== "all") {
      txs = txs.filter((t) => t.account_id === filterAccountId);
    }
    if (filterCategoryId !== "all") {
      // Include the selected category and all its descendants
      const descendants = new Set<string>([filterCategoryId]);
      const findDescendants = (parentId: string) => {
        for (const cat of categories) {
          if (cat.parent_id === parentId) {
            descendants.add(cat.id);
            findDescendants(cat.id);
          }
        }
      };
      findDescendants(filterCategoryId);
      txs = txs.filter((t) => t.category_id && descendants.has(t.category_id));
    }
    return txs;
  }, [fluxoTransactions, filterAccountId, filterCategoryId, categories]);

  // Fluxo de Caixa data processing with hierarchy
  type FluxoNode = {
    id: string;
    name: string;
    hierarchyIndex: string;
    type: string;
    months: number[];
    children: FluxoNode[];
    depth: number;
  };

  const fluxoCaixaData = useMemo(() => {
    const MONTH_LABELS = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];
    const catMap = Object.fromEntries(categories.map((c) => [c.id, c]));

    // Build monthly totals by leaf category
    const catMonthly: Record<string, number[]> = {};
    const totalReceitas = new Array(12).fill(0);
    const totalDespesas = new Array(12).fill(0);

    for (const t of filteredTransactions) {
      if (t.transaction_type === "transferencia") continue;
      const month = new Date(t.transaction_date).getMonth();
      const amt = Number(t.amount);
      if (t.transaction_type === "receita") totalReceitas[month] += amt;
      else totalDespesas[month] += amt;

      if (t.category_id) {
        if (!catMonthly[t.category_id]) catMonthly[t.category_id] = new Array(12).fill(0);
        catMonthly[t.category_id][month] += amt;
      }
    }

    const totalSaldo = totalReceitas.map((r, i) => r - totalDespesas[i]);
    const sumArr = (arr: number[]) => arr.reduce((a, b) => a + b, 0);
    const avgArr = (arr: number[]) => {
      const nonZero = arr.filter((v) => v > 0);
      return nonZero.length > 0 ? sumArr(nonZero) / nonZero.length : 0;
    };

    // Build tree for each type
    const buildTree = (type: string): FluxoNode[] => {
      const relevantCats = categories.filter((c) => c.transaction_type === type);
      const relevantIds = new Set(relevantCats.map((c) => c.id));

      // Find all categories that have data or whose descendants have data
      const catsWithData = new Set<string>();
      for (const catId of Object.keys(catMonthly)) {
        const cat = catMap[catId];
        if (!cat || cat.transaction_type !== type) continue;
        // Mark this and all ancestors
        let current: string | null = catId;
        while (current) {
          catsWithData.add(current);
          const c = catMap[current];
          current = c?.parent_id ?? null;
        }
      }

      const buildNodes = (parentId: string | null): FluxoNode[] => {
        return relevantCats
          .filter((c) => c.parent_id === parentId && catsWithData.has(c.id))
          .map((c) => {
            const children = buildNodes(c.id);
            const leafMonths = catMonthly[c.id] || new Array(12).fill(0);
            // If has children, aggregate from children + own leaf data
            const months = children.length > 0
              ? leafMonths.map((v, i) => v + children.reduce((sum, ch) => sum + ch.months[i], 0))
              : [...leafMonths];
            return {
              id: c.id,
              name: c.name,
              hierarchyIndex: c.hierarchy_index || "",
              type,
              months,
              children,
              depth: 0,
            };
          });
      };

      const nodes = buildNodes(null);

      const sortNodes = (nodes: FluxoNode[]): FluxoNode[] => {
        return nodes
          .map((n) => ({ ...n, children: sortNodes(n.children) }))
          .sort((a, b) => {
            const catA = catMap[a.id];
            const catB = catMap[b.id];
            const sortA = catA?.sort_order ?? 0;
            const sortB = catB?.sort_order ?? 0;
            if (sortA !== sortB) return sortA - sortB;
            return (a.hierarchyIndex || "").localeCompare(b.hierarchyIndex || "");
          });
      };

      return sortNodes(nodes);
    };

    const receitaTree = buildTree("receita");
    const despesaTree = buildTree("despesa");

    return {
      MONTH_LABELS,
      totalReceitas,
      totalDespesas,
      totalSaldo,
      receitaTree,
      despesaTree,
      sumArr,
      avgArr,
    };
  }, [filteredTransactions, categories]);

  // Flatten tree respecting collapsed state
  const flattenTree = (nodes: FluxoNode[], depth: number): FluxoNode[] => {
    const result: FluxoNode[] = [];
    for (const node of nodes) {
      result.push({ ...node, depth });
      if (node.children.length > 0 && !collapsedIds.has(node.id)) {
        result.push(...flattenTree(node.children, depth + 1));
      }
    }
    return result;
  };

  const flatReceitas = useMemo(() => flattenTree(fluxoCaixaData.receitaTree, 0), [fluxoCaixaData.receitaTree, collapsedIds]);
  const flatDespesas = useMemo(() => flattenTree(fluxoCaixaData.despesaTree, 0), [fluxoCaixaData.despesaTree, collapsedIds]);

  return (
    <div className="space-y-6" ref={reportRef}>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Relatórios</h1>
            <p className="text-sm text-muted-foreground">Analise suas finanças com relatórios detalhados</p>
          </div>
          <Button
            variant={showFilters ? "default" : "outline"}
            size="sm"
            className="gap-1.5"
            onClick={() => setShowFilters((v) => !v)}
          >
            <Filter className="h-3.5 w-3.5" /> Filtros
            {(filterAccountId !== "all" || filterCategoryId !== "all") && (
              <span className="ml-1 h-5 w-5 rounded-full bg-primary-foreground text-primary text-xs flex items-center justify-center font-bold">
                {(filterAccountId !== "all" ? 1 : 0) + (filterCategoryId !== "all" ? 1 : 0)}
              </span>
            )}
          </Button>
        </div>
      </div>

      {showFilters && (
        <Card className="shadow-sm">
          <CardContent className="pt-4 pb-4">
            <div className="flex flex-wrap items-end gap-4">
              <div className="space-y-1.5 min-w-[180px]">
                <label className="text-xs font-medium text-muted-foreground">Conta Bancária</label>
                <Select value={filterAccountId} onValueChange={setFilterAccountId}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Todas as contas" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as contas</SelectItem>
                    {accounts.map((acc) => (
                      <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 min-w-[180px]">
                <label className="text-xs font-medium text-muted-foreground">Categoria</label>
                <Select value={filterCategoryId} onValueChange={setFilterCategoryId}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Todas as categorias" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as categorias</SelectItem>
                    {categories
                      .filter((c) => !c.parent_id)
                      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
                      .map((cat) => (
                        <SelectItem key={cat.id} value={cat.id}>
                          {cat.hierarchy_index ? `${cat.hierarchy_index}. ` : ""}{cat.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              {(filterAccountId !== "all" || filterCategoryId !== "all") && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1 text-muted-foreground"
                  onClick={() => {
                    setFilterAccountId("all");
                    setFilterCategoryId("all");
                  }}
                >
                  <X className="h-3.5 w-3.5" /> Limpar filtros
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between pb-4">
          <CardTitle className="text-base">Fluxo de Caixa Anual</CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setFluxoYear((y) => y - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-semibold w-12 text-center">{fluxoYear}</span>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setFluxoYear((y) => y + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" className="gap-1" onClick={expandAll}>
              <ChevronsUpDown className="h-3.5 w-3.5" /> Expandir
            </Button>
            <Button variant="outline" size="sm" className="gap-1" onClick={collapseAll}>
              <ChevronsUpDown className="h-3.5 w-3.5 rotate-90" /> Colapsar
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="ml-2 gap-1"
              onClick={() => {
                const printWindow = window.open("", "_blank");
                if (!printWindow) return;
                const tableEl = document.getElementById("fluxo-caixa-table");
                if (!tableEl) return;
                printWindow.document.write(`
                  <!DOCTYPE html><html><head><title>Fluxo de Caixa ${fluxoYear}</title>
                  <style>
                    body { font-family: Arial, sans-serif; font-size: 10px; }
                    table { width: 100%; border-collapse: collapse; }
                    th, td { padding: 4px 6px; border: 1px solid #ddd; text-align: right; white-space: nowrap; }
                    th { background: #f5f5f5; }
                    td:first-child, th:first-child { text-align: left; }
                    .receita { color: #16a34a; } .despesa { color: #dc2626; } .saldo-pos { color: #2563eb; } .saldo-neg { color: #dc2626; }
                    .header-row { background: #f0f0f0; font-weight: bold; }
                    .cat-row td:first-child { padding-left: 24px; }
                    @media print { body { padding: 0; } }
                  </style></head><body>
                  <h2>Fluxo de Caixa — ${fluxoYear}</h2>
                  ${tableEl.outerHTML}
                  </body></html>
                `);
                printWindow.document.close();
                printWindow.print();
              }}
            >
              <Printer className="h-3.5 w-3.5" /> Imprimir
            </Button>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table id="fluxo-caixa-table" className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 px-2 font-semibold text-muted-foreground sticky left-0 bg-card min-w-[180px]"></th>
                {fluxoCaixaData.MONTH_LABELS.map((m) => (
                  <th key={m} className="text-right py-2 px-2 font-semibold text-muted-foreground min-w-[90px]">{m}</th>
                ))}
                <th className="text-right py-2 px-2 font-semibold text-muted-foreground min-w-[90px]">MÉDIA</th>
                <th className="text-right py-2 px-2 font-semibold text-muted-foreground min-w-[100px]">TOTAL</th>
              </tr>
            </thead>
            <tbody>
              {/* Receitas row */}
              <tr className="border-b bg-success/5 font-semibold">
                <td className="py-2 px-2 text-success sticky left-0 bg-success/5">Receitas</td>
                {fluxoCaixaData.totalReceitas.map((v, i) => (
                  <td key={i} className="text-right py-2 px-2 text-success tabular-nums">{v > 0 ? formatBRL(v) : "-"}</td>
                ))}
                <td className="text-right py-2 px-2 text-success tabular-nums">{formatBRL(fluxoCaixaData.avgArr(fluxoCaixaData.totalReceitas))}</td>
                <td className="text-right py-2 px-2 text-success font-bold tabular-nums">{formatBRL(fluxoCaixaData.sumArr(fluxoCaixaData.totalReceitas))}</td>
              </tr>
              {/* Despesas row */}
              <tr className="border-b bg-destructive/5 font-semibold">
                <td className="py-2 px-2 text-destructive sticky left-0 bg-destructive/5">Despesas</td>
                {fluxoCaixaData.totalDespesas.map((v, i) => (
                  <td key={i} className="text-right py-2 px-2 text-destructive tabular-nums">{v > 0 ? formatBRL(v) : "-"}</td>
                ))}
                <td className="text-right py-2 px-2 text-destructive tabular-nums">{formatBRL(fluxoCaixaData.avgArr(fluxoCaixaData.totalDespesas))}</td>
                <td className="text-right py-2 px-2 text-destructive font-bold tabular-nums">{formatBRL(fluxoCaixaData.sumArr(fluxoCaixaData.totalDespesas))}</td>
              </tr>
              {/* Saldo row */}
              <tr className="border-b-2 border-foreground/20 font-bold">
                <td className="py-2 px-2 sticky left-0 bg-card">SALDO</td>
                {fluxoCaixaData.totalSaldo.map((v, i) => (
                  <td key={i} className={cn("text-right py-2 px-2 tabular-nums", v >= 0 ? "text-primary" : "text-destructive")}>{formatBRL(v)}</td>
                ))}
                <td className="text-right py-2 px-2 tabular-nums">{formatBRL(fluxoCaixaData.avgArr(fluxoCaixaData.totalSaldo))}</td>
                <td className="text-right py-2 px-2 tabular-nums">{formatBRL(fluxoCaixaData.sumArr(fluxoCaixaData.totalSaldo))}</td>
              </tr>

              {/* Category detail */}
              {(flatReceitas.length > 0 || flatDespesas.length > 0) && (
                <>
                  <tr><td colSpan={15} className="py-3 px-2 text-xs font-bold text-muted-foreground uppercase tracking-wider bg-muted/30 sticky left-0">Categorias (Detalhamento)</td></tr>

                  {/* RECEITAS section */}
                  {flatReceitas.length > 0 && (
                    <>
                      <tr className="border-b bg-success/5">
                        <td colSpan={15} className="py-1.5 px-2 font-bold text-success text-xs uppercase sticky left-0 bg-success/5">RECEITAS</td>
                      </tr>
                      {flatReceitas.map((node) => {
                        const hasChildren = node.children.length > 0;
                        const isCollapsed = collapsedIds.has(node.id);
                        const paddingLeft = 12 + node.depth * 16;
                        return (
                          <tr key={node.id + "-" + node.depth} className={cn("border-b hover:bg-muted/30", hasChildren && "bg-muted/10")}>
                            <td
                              className={cn("py-1.5 px-2 sticky left-0", hasChildren ? "font-semibold text-foreground cursor-pointer select-none bg-muted/10" : "text-muted-foreground bg-card")}
                              style={{ paddingLeft }}
                              onClick={hasChildren ? () => toggleCollapse(node.id) : undefined}
                            >
                              <span className="inline-flex items-center gap-1">
                                {hasChildren && (
                                  <ChevronRight className={cn("h-3.5 w-3.5 transition-transform shrink-0", !isCollapsed && "rotate-90")} />
                                )}
                                {node.hierarchyIndex ? `${node.hierarchyIndex}. ` : ""}{node.name}
                              </span>
                            </td>
                            {node.months.map((v, i) => (
                              <td key={i} className={cn("text-right py-1.5 px-2 tabular-nums", hasChildren ? "font-medium text-foreground" : "text-foreground")}>
                                {v > 0 ? formatBRL(v) : "-"}
                              </td>
                            ))}
                            <td className={cn("text-right py-1.5 px-2 tabular-nums", hasChildren && "font-medium")}>{formatBRL(fluxoCaixaData.avgArr(node.months))}</td>
                            <td className={cn("text-right py-1.5 px-2 tabular-nums", hasChildren ? "font-bold" : "font-medium")}>{formatBRL(fluxoCaixaData.sumArr(node.months))}</td>
                          </tr>
                        );
                      })}
                    </>
                  )}

                  {/* DESPESAS section */}
                  {flatDespesas.length > 0 && (
                    <>
                      <tr className="border-b bg-destructive/5">
                        <td colSpan={15} className="py-1.5 px-2 font-bold text-destructive text-xs uppercase sticky left-0 bg-destructive/5">DESPESAS</td>
                      </tr>
                      {flatDespesas.map((node) => {
                        const hasChildren = node.children.length > 0;
                        const isCollapsed = collapsedIds.has(node.id);
                        const paddingLeft = 12 + node.depth * 16;
                        return (
                          <tr key={node.id + "-" + node.depth} className={cn("border-b hover:bg-muted/30", hasChildren && "bg-muted/10")}>
                            <td
                              className={cn("py-1.5 px-2 sticky left-0", hasChildren ? "font-semibold text-foreground cursor-pointer select-none bg-muted/10" : "text-muted-foreground bg-card")}
                              style={{ paddingLeft }}
                              onClick={hasChildren ? () => toggleCollapse(node.id) : undefined}
                            >
                              <span className="inline-flex items-center gap-1">
                                {hasChildren && (
                                  <ChevronRight className={cn("h-3.5 w-3.5 transition-transform shrink-0", !isCollapsed && "rotate-90")} />
                                )}
                                {node.hierarchyIndex ? `${node.hierarchyIndex}. ` : ""}{node.name}
                              </span>
                            </td>
                            {node.months.map((v, i) => (
                              <td key={i} className={cn("text-right py-1.5 px-2 tabular-nums", hasChildren ? "font-medium text-foreground" : "text-foreground")}>
                                {v > 0 ? formatBRL(v) : "-"}
                              </td>
                            ))}
                            <td className={cn("text-right py-1.5 px-2 tabular-nums", hasChildren && "font-medium")}>{formatBRL(fluxoCaixaData.avgArr(node.months))}</td>
                            <td className={cn("text-right py-1.5 px-2 tabular-nums", hasChildren ? "font-bold" : "font-medium")}>{formatBRL(fluxoCaixaData.sumArr(node.months))}</td>
                          </tr>
                        );
                      })}
                    </>
                  )}
                </>
              )}
            </tbody>
          </table>
          {filteredTransactions.length === 0 && (
            <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
              {fluxoTransactions.length === 0 ? `Nenhuma movimentação em ${fluxoYear}` : "Nenhum resultado com os filtros selecionados"}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
