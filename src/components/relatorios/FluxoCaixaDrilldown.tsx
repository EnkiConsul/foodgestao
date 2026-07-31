import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Download, FileText, Loader2, Search, X } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { applyFinancialScope, assertFinancialScope, type ContextType } from "@/lib/financialScope";
import { usePrivacy } from "@/hooks/usePrivacy";
import {
  effectiveAmount,
  effectiveDate,
  type DateBasis,
  type MatrizCategory,
  type MatrizRow,
} from "@/lib/relatorios/fluxoCaixaMatriz";
import {
  applyFluxoFiltros,
  fluxoFiltrosKey,
  type FluxoFiltros,
} from "@/lib/relatorios/fluxoCaixaFiltros";
import { downloadCsv, openPrintable } from "@/lib/relatorios/fluxoCaixaExport";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 25;

type SortField = "date" | "amount" | "description" | "status";

export type DrilldownTarget = {
  row: MatrizRow;
  /** "yyyy-MM" da célula, ou null para Média/Total (período inteiro) */
  month: string | null;
};

type Props = {
  target: DrilldownTarget | null;
  onOpenChange: (open: boolean) => void;
  categories: MatrizCategory[];
  months: string[];
  basis: DateBasis;
  context: ContextType;
  userId: string;
  companyId: string | null;
  filtros: FluxoFiltros;
  /** limites exatos do período selecionado (yyyy-MM-dd), usados para recortar meses parciais */
  periodStart?: string;
  periodEnd?: string;
};

type Row = {
  id: string;
  description: string | null;
  amount: number | string | null;
  amount_paid: number | string | null;
  category_id: string | null;
  transaction_type: string | null;
  parcel_direction: string | null;
  transaction_date: string | null;
  due_date: string | null;
  payment_date: string | null;
  status: string | null;
};

function monthBounds(month: string) {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return { start: `${month}-01`, end: `${month}-${String(last).padStart(2, "0")}` };
}

/** ids da categoria e de todos os seus descendentes */
function subtreeIds(categories: MatrizCategory[], rootId: string): string[] {
  const childrenOf = new Map<string, string[]>();
  for (const c of categories) {
    if (!c.parent_id) continue;
    const list = childrenOf.get(c.parent_id) ?? [];
    list.push(c.id);
    childrenOf.set(c.parent_id, list);
  }
  const out: string[] = [];
  const stack = [rootId];
  const seen = new Set<string>();
  while (stack.length) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    for (const kid of childrenOf.get(id) ?? []) stack.push(kid);
  }
  return out;
}

export function FluxoCaixaDrilldown({
  target,
  onOpenChange,
  categories,
  months,
  basis,
  context,
  userId,
  companyId,
  filtros,
}: Props) {
  const { maskBRL } = usePrivacy();
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [sortField, setSortField] = useState<SortField>("date");
  const [sortAsc, setSortAsc] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    setPage(0);
    setSearch("");
    setDebounced("");
    setSortField("date");
    setSortAsc(false);
  }, [target?.row.id, target?.month]);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(search.trim());
      setPage(0);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(0);
  }, [sortField, sortAsc]);

  const catName = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories]);

  const range = useMemo(() => {
    const list = target?.month ? [target.month] : months;
    if (!list.length) return null;
    return { start: monthBounds(list[0]).start, end: monthBounds(list[list.length - 1]).end };
  }, [target?.month, months]);

  const isSemCategoria = !!target && target.row.id.startsWith("__sem_categoria__");
  const isGroup = target?.row.kind === "group";
  const isSaldo = target?.row.kind === "saldo";

  const categoryIds = useMemo(() => {
    if (!target || isSemCategoria || isGroup || isSaldo) return null;
    return subtreeIds(categories, target.row.id);
  }, [target, categories, isSemCategoria, isGroup, isSaldo]);

  const orderCol =
    sortField === "amount"
      ? "amount"
      : sortField === "description"
        ? "description"
        : sortField === "status"
          ? "status"
          : basis === "pagamento"
            ? "payment_date"
            : "due_date";

  const buildQuery = (withCount: boolean) => {
    const scope = assertFinancialScope({ context, userId, companyId });
    let q = applyFinancialScope(
      supabase
        .from("transactions")
        .select(
          "id, description, amount, amount_paid, category_id, transaction_type, parcel_direction, transaction_date, due_date, payment_date, status",
          withCount ? { count: "exact" } : undefined,
        ),
      scope,
    ).neq("status", "cancelado");

    if (basis === "pagamento") {
      q = q.gte("payment_date", range!.start).lte("payment_date", range!.end);
    } else {
      q = q.or(
        `and(due_date.gte.${range!.start},due_date.lte.${range!.end}),and(due_date.is.null,transaction_date.gte.${range!.start},transaction_date.lte.${range!.end})`,
      );
    }

    // Lado (entrada/saída), inclui parcelamentos direcionados
    const side = target!.row.side;
    if (side) {
      q = q.or(
        `transaction_type.eq.${side},and(transaction_type.eq.parcelamento,parcel_direction.eq.${side})`,
      );
    } else {
      q = q.in("transaction_type", ["entrada", "saida", "parcelamento"]);
    }

    if (categoryIds) q = q.in("category_id", categoryIds);
    else if (isSemCategoria) q = q.is("category_id", null);

    q = applyFluxoFiltros(q, filtros);

    if (debounced) {
      const term = debounced.replace(/[%,]/g, " ");
      q = q.ilike("description", `%${term}%`);
    }

    return q.order(orderCol, { ascending: sortAsc, nullsFirst: false });
  };

  const { data, isFetching } = useQuery({
    queryKey: [
      "fc-drilldown",
      target?.row.id,
      target?.month,
      basis,
      context,
      companyId,
      range?.start,
      range?.end,
      page,
      debounced,
      sortField,
      sortAsc,
      fluxoFiltrosKey(filtros),
    ],
    enabled: !!target && !!range,
    queryFn: async () => {
      const { data, error, count } = await buildQuery(true).range(
        page * PAGE_SIZE,
        page * PAGE_SIZE + PAGE_SIZE - 1,
      );
      if (error) throw error;
      return { rows: (data ?? []) as unknown as Row[], count: count ?? 0 };
    },
  });

  /** Busca todos os lançamentos da célula (paginado) para exportação. */
  const fetchAllRows = async (): Promise<Row[]> => {
    const all: Row[] = [];
    for (let p = 0; p < 20; p++) {
      const { data, error } = await buildQuery(false).range(p * 500, p * 500 + 499);
      if (error) throw error;
      const chunk = (data ?? []) as unknown as Row[];
      all.push(...chunk);
      if (chunk.length < 500) break;
    }
    return all;
  };


  const rows = data?.rows ?? [];
  const count = data?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));

  const periodLabel = target?.month
    ? format(parseISO(`${target.month}-01`), "MMMM 'de' yyyy", { locale: ptBR })
    : months.length
      ? `${format(parseISO(`${months[0]}-01`), "MMM/yy", { locale: ptBR })} – ${format(parseISO(`${months[months.length - 1]}-01`), "MMM/yy", { locale: ptBR })}`
      : "";

  const pageSum = rows.reduce(
    (s, r) =>
      s +
      effectiveAmount(
        { ...r, transaction_date: r.transaction_date, due_date: r.due_date, payment_date: r.payment_date },
        basis,
      ),
    0,
  );

  const titulo = `${target?.row.index ? `${target.row.index}. ` : ""}${target?.row.name ?? ""}`;
  const fileBase = `fluxo-caixa-detalhe-${(target?.row.name ?? "lancamentos")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .toLowerCase()}-${target?.month ?? "periodo"}`;

  const exportRows = (all: Row[]) =>
    all.map((r) => {
      const d = effectiveDate(r as never, basis);
      const v = effectiveAmount(r as never, basis);
      const side = r.transaction_type === "parcelamento" ? r.parcel_direction : r.transaction_type;
      return {
        data: d ? format(parseISO(d), "dd/MM/yyyy") : "",
        descricao: r.description || "Sem descrição",
        categoria: (r.category_id && catName.get(r.category_id)) || "Sem categoria",
        status: r.status ?? "",
        tipo: side === "entrada" ? "Entrada" : "Saída",
        valor: v,
      };
    });

  const handleExportCsv = async () => {
    setExporting(true);
    try {
      const all = exportRows(await fetchAllRows());
      downloadCsv(`${fileBase}.csv`, [
        ["Data", "Descrição", "Categoria", "Status", "Tipo", "Valor"],
        ...all.map((r) => [r.data, r.descricao, r.categoria, r.status, r.tipo, r.valor]),
      ]);
      toast.success(`${all.length} lançamento${all.length === 1 ? "" : "s"} exportado(s)`);
    } catch {
      toast.error("Não foi possível exportar o CSV");
    } finally {
      setExporting(false);
    }
  };

  const handleExportPdf = async () => {
    setExporting(true);
    try {
      const all = exportRows(await fetchAllRows());
      const total = all.reduce((s, r) => s + r.valor, 0);
      const ok = openPrintable({
        title: `Fluxo de Caixa · ${titulo}`,
        subtitle: `${periodLabel} · base ${basis === "pagamento" ? "pagamento" : "vencimento"} · ${all.length} lançamento${all.length === 1 ? "" : "s"}`,
        head: ["Data", "Descrição", "Categoria", "Status", "Tipo", "Valor"],
        aligns: ["left", "left", "left", "left", "left", "right"],
        body: [
          ...all.map((r) => ({
            cells: [
              r.data,
              r.descricao,
              r.categoria,
              r.status,
              r.tipo,
              r.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 }),
            ],
          })),
          {
            cls: "saldo",
            cells: ["", "", "", "", "Total", total.toLocaleString("pt-BR", { minimumFractionDigits: 2 })],
          },
        ],
      });
      if (!ok) toast.error("Permita pop-ups para gerar o PDF");
    } catch {
      toast.error("Não foi possível gerar o PDF");
    } finally {
      setExporting(false);
    }
  };


  return (
    <Dialog open={!!target} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="text-base">
            {target?.row.index ? `${target.row.index}. ` : ""}
            {target?.row.name ?? ""}
          </DialogTitle>
          <DialogDescription className="capitalize">
            {periodLabel} · base {basis === "pagamento" ? "pagamento" : "vencimento"} · {count} lançamento
            {count === 1 ? "" : "s"}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por descrição..."
              className="h-8 pl-8 pr-8 text-sm"
              aria-label="Buscar lançamentos"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="Limpar busca"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <Select value={sortField} onValueChange={(v) => setSortField(v as SortField)}>
            <SelectTrigger className="h-8 w-[150px] text-xs" aria-label="Ordenar por">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="date">Data</SelectItem>
              <SelectItem value="amount">Valor</SelectItem>
              <SelectItem value="description">Descrição</SelectItem>
              <SelectItem value="status">Status</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1 text-xs"
            onClick={() => setSortAsc((v) => !v)}
            aria-label={sortAsc ? "Ordem crescente" : "Ordem decrescente"}
          >
            {sortAsc ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />}
            {sortAsc ? "Crescente" : "Decrescente"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1 text-xs"
            disabled={exporting || count === 0}
            onClick={handleExportCsv}
          >
            {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1 text-xs"
            disabled={exporting || count === 0}
            onClick={handleExportPdf}
          >
            {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
            PDF
          </Button>
        </div>


        <div className="max-h-[55vh] overflow-y-auto rounded-md border">
          {isFetching && rows.length === 0 ? (
            <div className="space-y-2 p-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-7 w-full" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">
              {debounced
                ? `Nenhum lançamento encontrado para "${debounced}".`
                : "Nenhum lançamento encontrado para esta célula."}
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/60">
                <tr className="text-xs uppercase text-muted-foreground">
                  {(
                    [
                      { key: "date", label: "Data", align: "text-left" },
                      { key: "description", label: "Descrição", align: "text-left" },
                      { key: null, label: "Categoria", align: "text-left" },
                      { key: "status", label: "Status", align: "text-left" },
                      { key: "amount", label: "Valor", align: "text-right" },
                    ] as { key: SortField | null; label: string; align: string }[]
                  ).map((h) => (
                    <th key={h.label} className={cn("px-3 py-2", h.align)}>
                      {h.key ? (
                        <button
                          type="button"
                          onClick={() => {
                            if (sortField === h.key) setSortAsc((v) => !v);
                            else {
                              setSortField(h.key as SortField);
                              setSortAsc(false);
                            }
                          }}
                          className={cn(
                            "inline-flex items-center gap-1 uppercase hover:text-foreground",
                            sortField === h.key && "text-foreground",
                          )}
                        >
                          {h.label}
                          {sortField === h.key &&
                            (sortAsc ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
                        </button>
                      ) : (
                        h.label
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const d = effectiveDate(r as never, basis);
                  const v = effectiveAmount(r as never, basis);
                  const side =
                    r.transaction_type === "parcelamento" ? r.parcel_direction : r.transaction_type;
                  return (
                    <tr key={r.id} className="border-t">
                      <td className="whitespace-nowrap px-3 py-1.5 tabular-nums">
                        {d ? format(parseISO(d), "dd/MM/yyyy") : "–"}
                      </td>
                      <td className="max-w-[260px] truncate px-3 py-1.5">{r.description || "Sem descrição"}</td>
                      <td className="max-w-[180px] truncate px-3 py-1.5 text-muted-foreground">
                        {(r.category_id && catName.get(r.category_id)) || "Sem categoria"}
                      </td>
                      <td className="px-3 py-1.5">
                        <Badge variant={r.status === "confirmado" ? "secondary" : "outline"} className="text-[10px]">
                          {r.status ?? "–"}
                        </Badge>
                      </td>
                      <td
                        className={cn(
                          "whitespace-nowrap px-3 py-1.5 text-right tabular-nums",
                          side === "entrada" ? "text-success" : "text-destructive",
                        )}
                      >
                        {maskBRL(v)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-2">
            {isFetching && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Soma da página: <strong className="tabular-nums text-foreground">{maskBRL(pageSum)}</strong>
          </span>
          <span className="flex items-center gap-2">
            Página {page + 1} de {totalPages}
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              aria-label="Página anterior"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              disabled={page + 1 >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              aria-label="Próxima página"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
