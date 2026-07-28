import { useMemo, useState, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { usePrivacy } from "@/hooks/usePrivacy";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { applyFinancialScope, assertFinancialScope, isFinancialScopeReady } from "@/lib/financialScope";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  ChevronsUpDown,
  Filter,
  CalendarIcon,
  TrendingUp,
  TrendingDown,
  Wallet,
  BarChart3,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { RelatoriosFiltersPanel } from "@/components/relatorios/RelatoriosFiltersPanel";
import { FluxoCaixaCategoryRow } from "@/components/relatorios/FluxoCaixaCategoryRow";
import {
  computeFluxoCaixa,
  flattenFluxoTree,
  collectParentIds,
  getPeriodRange,
  type PeriodPreset,
  type FluxoCategory,
  type FluxoTransaction,
} from "@/lib/relatorios/fluxoCaixa";
import { exportFluxoCaixaPdf } from "@/lib/relatorios/exportPdf";

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
  const [filterPaymentMethodId, setFilterPaymentMethodId] = useState<string>("all");
  const [filterContactId, setFilterContactId] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [showFilters, setShowFilters] = useState(false);
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>("year");
  const [customRange, setCustomRange] = useState<{ from: Date; to: Date }>(getPeriodRange("year"));

  const activeFilterCount =
    (filterAccountId !== "all" ? 1 : 0) +
    (filterCategoryId !== "all" ? 1 : 0) +
    (filterPaymentMethodId !== "all" ? 1 : 0) +
    (filterContactId !== "all" ? 1 : 0) +
    (filterStatus !== "all" ? 1 : 0);

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
    queryKey: ["relatorios-cats", user?.id, contextType, selectedCompanyId],
    enabled: !!user && (contextType === "pf" || !!selectedCompanyId),
    queryFn: async () => {
      const { data } = await supabase.rpc("get_accessible_categories", {
        _context: contextType,
        _company_id: contextType === "pj" ? selectedCompanyId! : undefined,
      });
      return (data ?? []).map((c: any): FluxoCategory => ({
        id: c.id, name: c.name, color: c.color,
        transaction_type: c.transaction_type, parent_id: c.parent_id,
        sort_order: c.sort_order,
      }));
    },
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ["relatorios-accounts", user?.id, contextType, selectedCompanyId],
    enabled: !!user,
    queryFn: async () => {
      if (contextType === "pj" && !selectedCompanyId) return [];
      const { data } = await supabase.rpc("get_accessible_accounts", {
        _context: contextType,
        _company_id: contextType === "pj" ? selectedCompanyId! : undefined,
      });
      return (data ?? []).map((a: any) => ({ id: a.id, name: a.name, account_type: a.account_type }));
    },
  });

  const { data: paymentMethods = [] } = useQuery({
    queryKey: ["relatorios-payment-methods", user?.id, contextType, selectedCompanyId],
    enabled: !!user && (contextType === "pf" || !!selectedCompanyId),
    queryFn: async () => {
      const { data } = await supabase.rpc("get_accessible_payment_methods", {
        _context: contextType,
        _company_id: contextType === "pj" ? selectedCompanyId! : undefined,
      });
      return ((data ?? []) as any[]).map((pm: any) => ({ id: pm.id, name: pm.name }));
    },
  });

  const { data: contacts = [] } = useQuery({
    queryKey: ["relatorios-contacts", user?.id, contextType, selectedCompanyId],
    enabled: !!user && (contextType === "pf" || !!selectedCompanyId),
    queryFn: async () => {
      const [{ data: allContacts }, { data: links }] = await Promise.all([
        supabase.from("contacts").select("id, name").eq("user_id", user!.id).eq("is_active", true).order("name"),
        supabase.from("contact_companies").select("contact_id, company_id"),
      ]);
      const contactsList = (allContacts ?? []) as { id: string; name: string }[];
      if (contextType === "pj") {
        const allowed = new Set(
          ((links ?? []) as { contact_id: string; company_id: string }[])
            .filter((l) => l.company_id === selectedCompanyId)
            .map((l) => l.contact_id)
        );
        return contactsList.filter((c) => allowed.has(c.id));
      }
      const linkedIds = new Set(((links ?? []) as { contact_id: string }[]).map((l) => l.contact_id));
      return contactsList.filter((c) => !linkedIds.has(c.id));
    },
  });

  const activeRange = useMemo(() => {
    if (periodPreset === "custom") return customRange;
    if (periodPreset === "year") {
      return { from: new Date(fluxoYear, 0, 1), to: new Date(fluxoYear, 11, 31) };
    }
    return getPeriodRange(periodPreset);
  }, [periodPreset, customRange, fluxoYear]);
  const startDate = format(activeRange.from, "yyyy-MM-dd");
  const endDate = format(activeRange.to, "yyyy-MM-dd");

  const { data: fluxoTransactions = [], isLoading: isLoadingFluxo } = useQuery({
    queryKey: ["relatorios-fluxo", user?.id, startDate, endDate, contextType, selectedCompanyId],
    enabled: !!user && isFinancialScopeReady(contextType, user?.id, selectedCompanyId),
    queryFn: async () => {
      const scope = assertFinancialScope({ context: contextType, userId: user!.id, companyId: selectedCompanyId });
      // Mesma regra da tela de Lançamentos: o período considera o vencimento
      // quando existe, senão a data do lançamento.
      const sel = (s: string): string => s;
      const all: FluxoTransaction[] = [];
      const pageSize = 1000;
      for (let page = 0; ; page++) {
        const q = applyFinancialScope(
          supabase
            .from("transactions")
            .select(sel("amount, amount_paid, transaction_type, transaction_date, category_id, account_id, status, due_date, parcel_direction, payment_method_id, contact_id")),
          scope,
        )
          .or(
            `and(due_date.is.null,transaction_date.gte.${startDate},transaction_date.lte.${endDate}),and(due_date.gte.${startDate},due_date.lte.${endDate})`,
          )
          .order("transaction_date", { ascending: true })
          .range(page * pageSize, page * pageSize + pageSize - 1);
        const { data, error } = await q.returns<FluxoTransaction[]>();
        if (error) throw error;
        const rows = data ?? [];
        all.push(...rows);
        if (rows.length < pageSize) break;
      }
      return all;
    },

  });

  const filteredTransactions = useMemo(() => {
    let txs = fluxoTransactions;
    if (filterStatus === "all") {
      txs = txs.filter((t) => t.status !== "cancelado");
    } else {
      txs = txs.filter((t) => t.status === filterStatus);
    }
    if (filterAccountId !== "all") {
      txs = txs.filter((t) => t.account_id === filterAccountId);
    }
    if (filterPaymentMethodId !== "all") {
      txs = txs.filter((t) => t.payment_method_id === filterPaymentMethodId);
    }
    if (filterContactId !== "all") {
      txs = txs.filter((t) => t.contact_id === filterContactId);
    }
    if (filterCategoryId !== "all") {
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
  }, [fluxoTransactions, filterAccountId, filterCategoryId, filterPaymentMethodId, filterContactId, filterStatus, categories]);

  const fluxoCaixaData = useMemo(
    () => computeFluxoCaixa(filteredTransactions, categories, activeRange),
    [filteredTransactions, categories, activeRange]
  );

  const flatReceitas = useMemo(
    () => flattenFluxoTree(fluxoCaixaData.receitaTree, 0, collapsedIds),
    [fluxoCaixaData.receitaTree, collapsedIds]
  );
  const flatDespesas = useMemo(
    () => flattenFluxoTree(fluxoCaixaData.despesaTree, 0, collapsedIds),
    [fluxoCaixaData.despesaTree, collapsedIds]
  );

  const kpis = useMemo(() => {
    const receitas = fluxoCaixaData.sumArr(fluxoCaixaData.totalReceitas);
    const despesas = fluxoCaixaData.sumArr(fluxoCaixaData.totalDespesas);
    const saldo = fluxoCaixaData.sumArr(fluxoCaixaData.totalSaldo);
    const mediaSaldo = fluxoCaixaData.avgArr(fluxoCaixaData.totalSaldo);
    return { receitas, despesas, saldo, mediaSaldo };
  }, [fluxoCaixaData]);

  const clearFilters = () => {
    setFilterAccountId("all");
    setFilterCategoryId("all");
    setFilterPaymentMethodId("all");
    setFilterContactId("all");
    setFilterStatus("all");
  };

  const periodLabel = `${format(activeRange.from, "dd/MM/yy", { locale: ptBR })} — ${format(activeRange.to, "dd/MM/yy", { locale: ptBR })}`;

  return (
    <div className="space-y-4 md:space-y-6" ref={reportRef}>
      {/* Cabeçalho */}
      <div className="flex flex-col gap-1">
        <h1 className="text-xl md:text-2xl font-bold tracking-tight">Relatórios</h1>
        <p className="text-xs md:text-sm text-muted-foreground">
          Analise suas finanças com relatórios detalhados · <span className="font-medium text-foreground/70">{periodLabel}</span>
        </p>
      </div>

      {/* Barra de controles */}
      <div className="sticky top-0 z-20 -mx-3 md:-mx-6 bg-background/95 px-3 md:px-6 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/70 border-b">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          {/* Período */}
          <div className="flex items-center gap-2 overflow-x-auto pb-0.5 lg:overflow-visible">
            <div className="inline-flex shrink-0 rounded-lg border bg-muted/40 p-0.5">
              {([
                { key: "month", label: "Mês" },
                { key: "3months", label: "3M" },
                { key: "6months", label: "6M" },
                { key: "year", label: "Ano" },
              ] as { key: PeriodPreset; label: string }[]).map((p) => (
                <Button
                  key={p.key}
                  variant="ghost"
                  size="sm"
                  aria-pressed={periodPreset === p.key}
                  className={cn(
                    "h-8 rounded-md px-3 text-xs font-medium",
                    periodPreset === p.key
                      ? "bg-background shadow-sm text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                  onClick={() => setPeriodPreset(p.key)}
                >
                  {p.label}
                </Button>
              ))}
            </div>

            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant={periodPreset === "custom" ? "default" : "outline"}
                  size="sm"
                  className="h-8 shrink-0 gap-1.5 text-xs"
                >
                  <CalendarIcon className="h-3.5 w-3.5" />
                  {periodPreset === "custom"
                    ? `${format(customRange.from, "dd/MM/yy")} - ${format(customRange.to, "dd/MM/yy")}`
                    : "Personalizado"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="range"
                  selected={{ from: customRange.from, to: customRange.to }}
                  onSelect={(range) => {
                    if (range?.from) {
                      setCustomRange({ from: range.from, to: range.to ?? range.from });
                      setPeriodPreset("custom");
                    }
                  }}
                  numberOfMonths={2}
                  locale={ptBR}
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>

            {periodPreset === "year" && (
              <div className="flex shrink-0 items-center gap-1 rounded-lg border px-1 py-0.5">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  aria-label="Ano anterior"
                  onClick={() => setFluxoYear((y) => y - 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="min-w-[2.75rem] text-center text-sm font-semibold tabular-nums">{fluxoYear}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  aria-label="Próximo ano"
                  onClick={() => setFluxoYear((y) => y + 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>

          {/* Ações */}
          <div className="flex items-center gap-2">
            <Button
              variant={showFilters ? "default" : "outline"}
              size="sm"
              className="h-8 flex-1 gap-1.5 text-xs lg:flex-none"
              aria-expanded={showFilters}
              onClick={() => setShowFilters((v) => !v)}
            >
              <Filter className="h-3.5 w-3.5" /> Filtros
              {activeFilterCount > 0 && (
                <span className="ml-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary-foreground px-1 text-[10px] font-bold text-primary">
                  {activeFilterCount}
                </span>
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 flex-1 gap-1.5 text-xs lg:flex-none"
              onClick={() => exportFluxoCaixaPdf(activeRange)}
            >
              <Download className="h-3.5 w-3.5" /> Exportar PDF
            </Button>
          </div>
        </div>
      </div>

      {/* Resumo do período */}
      <div className="grid grid-cols-2 gap-2 md:gap-3 xl:grid-cols-4">
        {[
          { label: "Receitas", value: kpis.receitas, icon: TrendingUp, cls: "text-success", bg: "bg-success/10" },
          { label: "Despesas", value: kpis.despesas, icon: TrendingDown, cls: "text-destructive", bg: "bg-destructive/10" },
          {
            label: "Saldo do período",
            value: kpis.saldo,
            icon: Wallet,
            cls: kpis.saldo >= 0 ? "text-primary" : "text-destructive",
            bg: kpis.saldo >= 0 ? "bg-primary/10" : "bg-destructive/10",
          },
          { label: "Média mensal", value: kpis.mediaSaldo, icon: BarChart3, cls: "text-foreground", bg: "bg-muted" },
        ].map((k) => (
          <Card key={k.label} className="shadow-sm">
            <CardContent className="flex items-center gap-3 p-3 md:p-4">
              <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", k.bg)}>
                <k.icon className={cn("h-4 w-4", k.cls)} />
              </span>
              <div className="min-w-0">
                <p className="truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground md:text-xs">
                  {k.label}
                </p>
                {isLoadingFluxo ? (
                  <Skeleton className="mt-1 h-5 w-20" />
                ) : (
                  <p className={cn("truncate text-base font-bold tabular-nums md:text-lg", k.cls)}>
                    {formatBRL(k.value)}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {showFilters && (
        <RelatoriosFiltersPanel
          accounts={accounts}
          categories={categories}
          paymentMethods={paymentMethods}
          contacts={contacts}
          filterAccountId={filterAccountId}
          filterCategoryId={filterCategoryId}
          filterPaymentMethodId={filterPaymentMethodId}
          filterContactId={filterContactId}
          filterStatus={filterStatus}
          activeFilterCount={activeFilterCount}
          onAccountChange={setFilterAccountId}
          onCategoryChange={setFilterCategoryId}
          onPaymentMethodChange={setFilterPaymentMethodId}
          onContactChange={setFilterContactId}
          onStatusChange={setFilterStatus}
          onClear={clearFilters}
        />
      )}

      <Card className="shadow-sm">
        <CardHeader className="flex flex-col md:flex-row md:items-start md:justify-between gap-3 pb-4">
          <div className="space-y-1.5 min-w-0">
            <CardTitle className="text-sm md:text-base flex items-center gap-2 flex-wrap">
              <span>Fluxo de Caixa</span>
              <span className="inline-flex items-center gap-1.5 rounded-md border border-primary/20 bg-primary/5 px-2 py-0.5 text-[11px] md:text-xs font-medium text-primary">
                <CalendarIcon className="h-3 w-3" />
                {format(activeRange.from, "dd/MM/yy", { locale: ptBR })}
                <span className="opacity-60">→</span>
                {format(activeRange.to, "dd/MM/yy", { locale: ptBR })}
              </span>
              <span className="text-[11px] md:text-xs font-normal text-muted-foreground">
                ({fluxoCaixaData.MONTH_LABELS.length} {fluxoCaixaData.MONTH_LABELS.length === 1 ? "mês" : "meses"})
              </span>
            </CardTitle>
            <p className="text-[11px] md:text-xs text-muted-foreground line-clamp-2 md:line-clamp-none">
              Meses incluídos no recorte:{" "}
              <span className="font-medium text-foreground/80">
                {fluxoCaixaData.MONTH_LABELS.join(" · ")}
              </span>
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" size="sm" className="gap-1 flex-1 md:flex-none min-h-9" onClick={expandAll}>
              <ChevronsUpDown className="h-3.5 w-3.5" /> Expandir
            </Button>
            <Button variant="outline" size="sm" className="gap-1 flex-1 md:flex-none min-h-9" onClick={collapseAll}>
              <ChevronsUpDown className="h-3.5 w-3.5 rotate-90" /> Colapsar
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1 flex-1 md:flex-none min-h-9"
              onClick={() => exportFluxoCaixaPdf(activeRange)}
            >
              <Download className="h-3.5 w-3.5" /> PDF
            </Button>
          </div>
        </CardHeader>
        <CardContent className="px-3 md:px-6">
          {/* Mobile: um card por mês, sem rolagem lateral */}
          <div className="space-y-2 md:hidden">
            {fluxoCaixaData.MONTH_LABELS.map((m, i) => {
              const rec = fluxoCaixaData.totalReceitas[i] ?? 0;
              const desp = fluxoCaixaData.totalDespesas[i] ?? 0;
              const sal = fluxoCaixaData.totalSaldo[i] ?? 0;
              return (
                <div key={m} className="rounded-xl border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{m}</span>
                    <span className={cn("text-base font-bold tabular-nums", sal >= 0 ? "text-primary" : "text-destructive")}>
                      {formatBRL(sal)}
                    </span>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-lg bg-success/5 px-2 py-1.5">
                      <p className="text-muted-foreground">Receitas</p>
                      <p className="font-semibold text-success tabular-nums">{formatBRL(rec)}</p>
                    </div>
                    <div className="rounded-lg bg-destructive/5 px-2 py-1.5">
                      <p className="text-muted-foreground">Despesas</p>
                      <p className="font-semibold text-destructive tabular-nums">{formatBRL(desp)}</p>
                    </div>
                  </div>
                </div>
              );
            })}
            <div className="rounded-xl border-2 border-primary/30 bg-primary/5 p-3 flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wide">Total do período</span>
              <span className="text-base font-bold tabular-nums">
                {formatBRL(fluxoCaixaData.sumArr(fluxoCaixaData.totalSaldo))}
              </span>
            </div>
            <p className="pt-1 text-[11px] text-muted-foreground">
              Detalhamento por categoria disponível no computador ou no PDF.
            </p>
          </div>

          <div className="hidden md:block overflow-x-auto">
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
              <tr className="border-b bg-success/5 font-semibold">
                <td className="py-2 px-2 text-success sticky left-0 bg-success/5">Receitas</td>
                {fluxoCaixaData.totalReceitas.map((v, i) => (
                  <td key={i} className="text-right py-2 px-2 text-success tabular-nums">{v > 0 ? formatBRL(v) : "-"}</td>
                ))}
                <td className="text-right py-2 px-2 text-success tabular-nums">{formatBRL(fluxoCaixaData.avgArr(fluxoCaixaData.totalReceitas))}</td>
                <td className="text-right py-2 px-2 text-success font-bold tabular-nums">{formatBRL(fluxoCaixaData.sumArr(fluxoCaixaData.totalReceitas))}</td>
              </tr>
              <tr className="border-b bg-destructive/5 font-semibold">
                <td className="py-2 px-2 text-destructive sticky left-0 bg-destructive/5">Despesas</td>
                {fluxoCaixaData.totalDespesas.map((v, i) => (
                  <td key={i} className="text-right py-2 px-2 text-destructive tabular-nums">{v > 0 ? formatBRL(v) : "-"}</td>
                ))}
                <td className="text-right py-2 px-2 text-destructive tabular-nums">{formatBRL(fluxoCaixaData.avgArr(fluxoCaixaData.totalDespesas))}</td>
                <td className="text-right py-2 px-2 text-destructive font-bold tabular-nums">{formatBRL(fluxoCaixaData.sumArr(fluxoCaixaData.totalDespesas))}</td>
              </tr>
              <tr className="border-b-2 border-foreground/20 font-bold">
                <td className="py-2 px-2 sticky left-0 bg-card">SALDO</td>
                {fluxoCaixaData.totalSaldo.map((v, i) => (
                  <td key={i} className={cn("text-right py-2 px-2 tabular-nums", v >= 0 ? "text-primary" : "text-destructive")}>{formatBRL(v)}</td>
                ))}
                <td className="text-right py-2 px-2 tabular-nums">{formatBRL(fluxoCaixaData.avgArr(fluxoCaixaData.totalSaldo))}</td>
                <td className="text-right py-2 px-2 tabular-nums">{formatBRL(fluxoCaixaData.sumArr(fluxoCaixaData.totalSaldo))}</td>
              </tr>

              {(flatReceitas.length > 0 || flatDespesas.length > 0) && (
                <>
                  <tr>
                    <td colSpan={fluxoCaixaData.MONTH_LABELS.length + 3} className="py-3 px-2 text-xs font-bold text-muted-foreground uppercase tracking-wider bg-muted/30 sticky left-0">
                      Categorias (Detalhamento)
                    </td>
                  </tr>

                  {flatReceitas.length > 0 && (
                    <>
                      <tr className="border-b bg-success/5">
                        <td colSpan={fluxoCaixaData.MONTH_LABELS.length + 3} className="py-1.5 px-2 font-bold text-success text-xs uppercase sticky left-0 bg-success/5">
                          RECEITAS
                        </td>
                      </tr>
                      {flatReceitas.map((node) => (
                        <FluxoCaixaCategoryRow
                          key={node.id + "-" + node.depth}
                          node={node}
                          isCollapsed={collapsedIds.has(node.id)}
                          onToggle={toggleCollapse}
                          formatBRL={formatBRL}
                          avg={fluxoCaixaData.avgArr}
                          sum={fluxoCaixaData.sumArr}
                        />
                      ))}
                    </>
                  )}

                  {flatDespesas.length > 0 && (
                    <>
                      <tr className="border-b bg-destructive/5">
                        <td colSpan={fluxoCaixaData.MONTH_LABELS.length + 3} className="py-1.5 px-2 font-bold text-destructive text-xs uppercase sticky left-0 bg-destructive/5">
                          DESPESAS
                        </td>
                      </tr>
                      {flatDespesas.map((node) => (
                        <FluxoCaixaCategoryRow
                          key={node.id + "-" + node.depth}
                          node={node}
                          isCollapsed={collapsedIds.has(node.id)}
                          onToggle={toggleCollapse}
                          formatBRL={formatBRL}
                          avg={fluxoCaixaData.avgArr}
                          sum={fluxoCaixaData.sumArr}
                        />
                      ))}
                    </>
                  )}
                </>
              )}
            </tbody>
          </table>
          </div>

          {filteredTransactions.length === 0 && (
            <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
              {fluxoTransactions.length === 0 ? "Nenhuma movimentação no período selecionado" : "Nenhum resultado com os filtros selecionados"}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
