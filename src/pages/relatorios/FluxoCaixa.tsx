import { useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronDown, ChevronRight, ChevronLeft, ChevronsUpDown, Download, Printer, TrendingUp, TrendingDown, Wallet, Sigma } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { usePrivacy } from "@/hooks/usePrivacy";
import { useRealtimeSync } from "@/hooks/useRealtimeSync";
import { useIsMobile } from "@/hooks/use-mobile";
import { applyFinancialScope, assertFinancialScope, isFinancialScopeReady } from "@/lib/financialScope";
import { CATEGORY_INDENT_STEP } from "@/lib/categories/display";
import {
  buildFluxoMatriz,
  monthsBetween,
  visibleRows,
  type DateBasis,
  type MatrizCategory,
  type MatrizTransaction,
  type MatrizRow,
} from "@/lib/relatorios/fluxoCaixaMatriz";

import { FluxoCaixaDrilldown, type DrilldownTarget } from "@/components/relatorios/FluxoCaixaDrilldown";
import { FluxoCaixaFiltros, useFluxoCaixaFiltroOpcoes } from "@/components/relatorios/FluxoCaixaFiltros";
import {
  FLUXO_FILTROS_PADRAO,
  applyFluxoFiltros,
  fluxoFiltrosKey,
  type FluxoFiltros,
} from "@/lib/relatorios/fluxoCaixaFiltros";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const PAGE_SIZE = 1000;

function fmtMonthKey(y: number, m: number) {
  return `${y}-${String(m).padStart(2, "0")}`;
}

export default function RelatorioFluxoCaixa() {
  const { user } = useAuth();
  const { contextType, selectedCompanyId } = useCompanyContext();
  const { maskBRL } = usePrivacy();
  const isMobile = useIsMobile();

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [fromMonth, setFromMonth] = useState(1);
  const [toMonth, setToMonth] = useState(now.getMonth() + 1);
  const [basis, setBasis] = useState<DateBasis>("pagamento");
  const [hideEmpty, setHideEmpty] = useState(true);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [mobileMonth, setMobileMonth] = useState(now.getMonth() + 1);
  const [drilldown, setDrilldown] = useState<DrilldownTarget | null>(null);
  const [filtros, setFiltros] = useState<FluxoFiltros>({ ...FLUXO_FILTROS_PADRAO });
  const filtrosKey = fluxoFiltrosKey(filtros);
  const filtroOpcoes = useFluxoCaixaFiltroOpcoes();


  useRealtimeSync({
    tables: ["transactions", "categories"],
    invalidateKeyPrefixes: ["fc-matriz-"],
  });

  const months = useMemo(
    () => monthsBetween(fmtMonthKey(year, Math.min(fromMonth, toMonth)), fmtMonthKey(year, Math.max(fromMonth, toMonth))),
    [year, fromMonth, toMonth],
  );

  const rangeStart = `${months[0]}-01`;
  const rangeEnd = useMemo(() => {
    const [y, m] = months[months.length - 1].split("-").map(Number);
    const last = new Date(y, m, 0).getDate();
    return `${months[months.length - 1]}-${String(last).padStart(2, "0")}`;
  }, [months]);

  const scopeReady = isFinancialScopeReady(contextType, user?.id, selectedCompanyId);

  const { data: categories = [], isLoading: loadingCats } = useQuery({
    queryKey: ["fc-matriz-categories", user?.id, contextType, selectedCompanyId],
    enabled: !!user && scopeReady,
    queryFn: async (): Promise<MatrizCategory[]> => {
      if (contextType === "pj") {
        const { data } = await supabase
          .from("categories")
          .select("id, name, parent_id, transaction_type, category_companies!inner(company_id)")
          .or("context.is.null,context.eq.pj")
          .eq("category_companies.company_id", selectedCompanyId!)
          .order("parent_id", { nullsFirst: true })
          .order("sort_order")
          .order("name");
        return (data ?? []) as unknown as MatrizCategory[];
      }
      const { data } = await supabase
        .from("categories")
        .select("id, name, parent_id, transaction_type")
        .eq("user_id", user!.id)
        .or("context.is.null,context.eq.pf")
        .eq("visible_pf", true)
        .order("parent_id", { nullsFirst: true })
        .order("sort_order")
        .order("name");
      return (data ?? []) as unknown as MatrizCategory[];
    },
  });

  const { data: transactions = [], isLoading: loadingTx } = useQuery({
    queryKey: ["fc-matriz-transactions", user?.id, contextType, selectedCompanyId, rangeStart, rangeEnd, basis],
    enabled: !!user && scopeReady,
    queryFn: async (): Promise<MatrizTransaction[]> => {
      const scope = assertFinancialScope({ context: contextType, userId: user!.id, companyId: selectedCompanyId });
      const all: MatrizTransaction[] = [];
      for (let page = 0; page < 50; page++) {
        let q = applyFinancialScope(
          supabase
            .from("transactions")
            .select(
              "category_id, amount, amount_paid, transaction_type, parcel_direction, transaction_date, due_date, payment_date, status",
            ),
          scope,
        ).neq("status", "cancelado");

        if (basis === "pagamento") {
          q = q.gte("payment_date", rangeStart).lte("payment_date", rangeEnd);
        } else {
          q = q.or(
            `and(due_date.gte.${rangeStart},due_date.lte.${rangeEnd}),and(due_date.is.null,transaction_date.gte.${rangeStart},transaction_date.lte.${rangeEnd})`,
          );
        }

        const { data, error } = await q.range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
        if (error) throw error;
        const rows = (data ?? []) as unknown as MatrizTransaction[];
        all.push(...rows);
        if (rows.length < PAGE_SIZE) break;
      }
      return all;
    },
  });

  const matriz = useMemo(
    () => buildFluxoMatriz({ categories, transactions, months, basis, hideEmpty }),
    [categories, transactions, months, basis, hideEmpty],
  );

  const rows = useMemo(() => visibleRows(matriz.rows, collapsed), [matriz.rows, collapsed]);

  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const allCollapsed = collapsed.size > 0;
  const toggleAll = () =>
    setCollapsed(allCollapsed ? new Set() : new Set(matriz.rows.filter((r) => r.hasChildren).map((r) => r.id)));

  const monthLabel = (key: string) => {
    const [, m] = key.split("-").map(Number);
    return MONTH_NAMES[m - 1].slice(0, 3).toUpperCase();
  };

  const canDrill = (r: MatrizRow) => r.kind !== "saldo";
  const openCell = (r: MatrizRow, month: string | null) => {
    if (!canDrill(r)) return;
    setDrilldown({ row: r, month });
  };
  const cellProps = (r: MatrizRow, month: string | null) =>
    canDrill(r)
      ? {
          role: "button" as const,
          tabIndex: 0,
          title: "Ver lançamentos",
          onClick: () => openCell(r, month),
          onKeyDown: (e: React.KeyboardEvent) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              openCell(r, month);
            }
          },
          className: "cursor-pointer hover:underline",
        }
      : {};

  const money = (v: number) => (v === 0 ? "–" : maskBRL(v));

  const handleExport = () => {
    const header = ["Categoria", ...months.map(monthLabel), "MÉDIA", "TOTAL"];
    const lines = [header.join(";")];
    for (const r of matriz.rows) {
      const name = `${r.index ? `${r.index}. ` : ""}${"  ".repeat(r.depth)}${r.name}`;
      lines.push(
        [
          `"${name.replace(/"/g, '""')}"`,
          ...r.values.map((v) => v.toFixed(2).replace(".", ",")),
          r.media.toFixed(2).replace(".", ","),
          r.total.toFixed(2).replace(".", ","),
        ].join(";"),
      );
    }
    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `fluxo-caixa-${year}-${fromMonth}-${toMonth}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Relatório exportado");
  };

  const isLoading = loadingCats || loadingTx;
  const blockedPj = contextType === "pj" && !selectedCompanyId;

  const yearOptions = Array.from({ length: 7 }, (_, i) => now.getFullYear() - 4 + i);

  const rowTone = (r: MatrizRow) =>
    r.kind === "saldo"
      ? "bg-primary/10 font-bold"
      : r.kind === "group"
        ? r.side === "entrada"
          ? "bg-success/10 font-semibold"
          : "bg-destructive/10 font-semibold"
        : r.depth <= 1
          ? "font-medium"
          : "";

  const valueTone = (r: MatrizRow, v: number) => {
    if (r.kind === "saldo") return v < 0 ? "text-destructive" : "text-success";
    return r.side === "entrada" ? "text-success" : "text-destructive";
  };

  const mobileIdx = Math.max(0, months.indexOf(fmtMonthKey(year, mobileMonth)));

  return (
    <div className="space-y-4">
      <Helmet>
        <title>Relatório de Fluxo de Caixa | 360°FOOD</title>
        <meta
          name="description"
          content="Relatório gerencial de fluxo de caixa por categoria, mês a mês, com médias, totais e saldo do período."
        />
      </Helmet>

      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight">Fluxo de Caixa</h1>
          <p className="text-xs md:text-sm text-muted-foreground">
            Relatório gerencial por categoria — {MONTH_NAMES[Math.min(fromMonth, toMonth) - 1]} a{" "}
            {MONTH_NAMES[Math.max(fromMonth, toMonth) - 1]} de {year}
          </p>
        </div>
        <div className="flex items-center gap-2 print:hidden">
          <Button variant="outline" size="sm" onClick={handleExport} className="gap-1">
            <Download className="h-3.5 w-3.5" /> CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.print()} className="gap-1">
            <Printer className="h-3.5 w-3.5" /> Imprimir
          </Button>
        </div>
      </div>

      {/* Filtros */}
      <Card className="sticky top-0 z-20 shadow-sm print:hidden">
        <CardContent className="flex flex-wrap items-center gap-2 p-3">
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setYear((y) => y - 1)} aria-label="Ano anterior">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger className="h-8 w-[92px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {yearOptions.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setYear((y) => y + 1)} aria-label="Próximo ano">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <Select value={String(fromMonth)} onValueChange={(v) => setFromMonth(Number(v))}>
            <SelectTrigger className="h-8 w-[128px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {MONTH_NAMES.map((m, i) => <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground">até</span>
          <Select value={String(toMonth)} onValueChange={(v) => setToMonth(Number(v))}>
            <SelectTrigger className="h-8 w-[128px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {MONTH_NAMES.map((m, i) => <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={basis} onValueChange={(v) => setBasis(v as DateBasis)}>
            <SelectTrigger className="h-8 w-[178px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="pagamento">Data de Pagamento</SelectItem>
              <SelectItem value="vencimento">Data de Vencimento</SelectItem>
            </SelectContent>
          </Select>

          <div className="ml-auto flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Switch id="hide-empty" checked={hideEmpty} onCheckedChange={setHideEmpty} />
              <Label htmlFor="hide-empty" className="text-xs text-muted-foreground">Só com movimento</Label>
            </div>
            <Button variant="outline" size="sm" onClick={toggleAll} className="gap-1">
              <ChevronsUpDown className="h-3.5 w-3.5" />
              {allCollapsed ? "Expandir" : "Recolher"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 md:gap-4">
        {[
          { label: "Entradas", value: matriz.totals.totalEntradas, icon: TrendingUp, cls: "text-success" },
          { label: "Saídas", value: matriz.totals.totalSaidas, icon: TrendingDown, cls: "text-destructive" },
          {
            label: "Saldo do período",
            value: matriz.totals.totalSaldo,
            icon: Wallet,
            cls: matriz.totals.totalSaldo >= 0 ? "text-success" : "text-destructive",
          },
          {
            label: "Média mensal",
            value: months.length ? matriz.totals.totalSaldo / months.length : 0,
            icon: Sigma,
            cls: "text-foreground",
          },
        ].map((k) => (
          <Card key={k.label} className="shadow-sm">
            <CardContent className="p-3 md:p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{k.label}</span>
                <k.icon className={cn("h-3.5 w-3.5", k.cls)} />
              </div>
              <div className={cn("mt-1 text-base md:text-xl font-bold tabular-nums", k.cls)}>{maskBRL(k.value)}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {blockedPj ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">Selecione uma empresa para visualizar o relatório.</CardContent></Card>
      ) : isLoading ? (
        <Card><CardContent className="space-y-2 p-4">{Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} className="h-7 w-full" />)}</CardContent></Card>
      ) : isMobile ? (
        /* ── Mobile: um mês por vez ─────────────────────────────── */
        <Card className="shadow-sm">
          <CardContent className="p-0">
            <div className="flex items-center justify-between border-b px-3 py-2">
              <Button
                variant="ghost" size="icon" className="h-8 w-8"
                onClick={() => setMobileMonth((m) => Math.max(Math.min(fromMonth, toMonth), m - 1))}
                aria-label="Mês anterior"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm font-semibold">
                {format(new Date(year, mobileMonth - 1, 1), "MMMM yyyy", { locale: ptBR })}
              </span>
              <Button
                variant="ghost" size="icon" className="h-8 w-8"
                onClick={() => setMobileMonth((m) => Math.min(Math.max(fromMonth, toMonth), m + 1))}
                aria-label="Próximo mês"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <ul className="divide-y">
              {rows.map((r) => {
                const v = r.values[mobileIdx] ?? 0;
                return (
                  <li key={r.id} className={cn("flex items-center gap-2 px-3 py-2 text-sm", rowTone(r))}>
                    <div className="flex min-w-0 flex-1 items-center gap-1" style={{ paddingLeft: r.depth * CATEGORY_INDENT_STEP }}>
                      {r.hasChildren ? (
                        <button onClick={() => toggle(r.id)} className="shrink-0 text-muted-foreground" aria-label="Alternar">
                          {collapsed.has(r.id) ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                        </button>
                      ) : <span className="w-3.5 shrink-0" />}
                      <span className="truncate">
                        {r.index && <span className="text-muted-foreground">{r.index}. </span>}
                        {r.name}
                      </span>
                    </div>
                    <button
                      type="button"
                      disabled={!canDrill(r)}
                      onClick={() => openCell(r, months[mobileIdx] ?? null)}
                      className={cn("shrink-0 tabular-nums", valueTone(r, v), canDrill(r) && "underline-offset-2 active:underline")}
                    >
                      {money(v)}
                    </button>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      ) : (
        /* ── Desktop: matriz ────────────────────────────────────── */
        <Card className="shadow-sm">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-muted/50">
                    <th className="sticky left-0 z-10 min-w-[280px] bg-muted/50 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Categoria
                    </th>
                    {months.map((m) => (
                      <th key={m} className="px-3 py-2 text-right text-xs font-semibold uppercase text-muted-foreground">
                        {monthLabel(m)}
                      </th>
                    ))}
                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-muted-foreground">Média</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-muted-foreground">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={months.length + 3} className="px-3 py-10 text-center text-sm text-muted-foreground">
                        Nenhuma movimentação no período selecionado.
                      </td>
                    </tr>
                  )}
                  {rows.map((r) => (
                    <tr key={r.id} className={cn("border-t transition-colors hover:bg-muted/40", rowTone(r))}>
                      <td
                        className={cn(
                          "sticky left-0 z-10 whitespace-nowrap px-3 py-1.5",
                          r.kind === "saldo" ? "bg-primary/10" : r.kind === "group" ? (r.side === "entrada" ? "bg-success/10" : "bg-destructive/10") : "bg-card",
                        )}
                      >
                        <div className="flex items-center gap-1" style={{ paddingLeft: r.depth * CATEGORY_INDENT_STEP }}>
                          {r.hasChildren ? (
                            <button
                              onClick={() => toggle(r.id)}
                              className="text-muted-foreground hover:text-foreground"
                              aria-label={collapsed.has(r.id) ? `Expandir ${r.name}` : `Recolher ${r.name}`}
                            >
                              {collapsed.has(r.id) ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                            </button>
                          ) : <span className="inline-block w-3.5" />}
                          <span>
                            {r.index && <span className="text-muted-foreground">{r.index}. </span>}
                            {r.name}
                          </span>
                        </div>
                      </td>
                      {r.values.map((v, i) => {
                        const { className: cellCls, ...cell } = cellProps(r, months[i]);
                        return (
                          <td
                            key={i}
                            {...cell}
                            className={cn("whitespace-nowrap px-3 py-1.5 text-right tabular-nums", valueTone(r, v), cellCls)}
                          >
                            {money(v)}
                          </td>
                        );
                      })}
                      {(() => {
                        const { className: mediaCls, ...mediaCell } = cellProps(r, null);
                        return (
                          <>
                            <td
                              {...mediaCell}
                              className={cn("whitespace-nowrap px-3 py-1.5 text-right tabular-nums", valueTone(r, r.media), mediaCls)}
                            >
                              {money(r.media)}
                            </td>
                            <td
                              {...mediaCell}
                              className={cn(
                                "whitespace-nowrap px-3 py-1.5 text-right font-semibold tabular-nums",
                                valueTone(r, r.total),
                                mediaCls,
                              )}
                            >
                              {money(r.total)}
                            </td>
                          </>
                        );
                      })()}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {user && (
        <FluxoCaixaDrilldown
          target={drilldown}
          onOpenChange={(open) => !open && setDrilldown(null)}
          categories={categories}
          months={months}
          basis={basis}
          context={contextType}
          userId={user.id}
          companyId={selectedCompanyId}
        />
      )}
    </div>
  );
}
