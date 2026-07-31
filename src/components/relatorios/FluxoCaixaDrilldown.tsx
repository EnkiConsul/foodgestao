import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { applyFinancialScope, assertFinancialScope, type FinancialContext } from "@/lib/financialScope";
import { usePrivacy } from "@/hooks/usePrivacy";
import {
  effectiveAmount,
  effectiveDate,
  type DateBasis,
  type MatrizCategory,
  type MatrizRow,
} from "@/lib/relatorios/fluxoCaixaMatriz";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 25;

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
  context: FinancialContext;
  userId: string;
  companyId: string | null;
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
}: Props) {
  const { maskBRL } = usePrivacy();
  const [page, setPage] = useState(0);

  useEffect(() => {
    setPage(0);
  }, [target?.row.id, target?.month]);

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
    ],
    enabled: !!target && !!range,
    queryFn: async () => {
      const scope = assertFinancialScope({ context, userId, companyId });
      let q = applyFinancialScope(
        supabase
          .from("transactions")
          .select(
            "id, description, amount, amount_paid, category_id, transaction_type, parcel_direction, transaction_date, due_date, payment_date, status",
            { count: "exact" },
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

      const orderCol = basis === "pagamento" ? "payment_date" : "due_date";
      const { data, error, count } = await q
        .order(orderCol, { ascending: false, nullsFirst: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
      if (error) throw error;
      return { rows: (data ?? []) as unknown as Row[], count: count ?? 0 };
    },
  });

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

        <div className="max-h-[55vh] overflow-y-auto rounded-md border">
          {isFetching && rows.length === 0 ? (
            <div className="space-y-2 p-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-7 w-full" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">
              Nenhum lançamento encontrado para esta célula.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/60">
                <tr className="text-xs uppercase text-muted-foreground">
                  <th className="px-3 py-2 text-left">Data</th>
                  <th className="px-3 py-2 text-left">Descrição</th>
                  <th className="px-3 py-2 text-left">Categoria</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-right">Valor</th>
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
