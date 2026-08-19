import { useState, useEffect } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Search, CalendarIcon, X, ChevronLeft, ChevronRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format, startOfDay, endOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { formatDate } from "@/lib/date-utils";
import { cn } from "@/lib/utils";

const actionLabels: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  user_activated: { label: "Usuário Ativado", variant: "default" },
  user_deactivated: { label: "Usuário Desativado", variant: "destructive" },
  company_created: { label: "Empresa Criada", variant: "default" },
  company_updated: { label: "Empresa Atualizada", variant: "secondary" },
  company_deleted: { label: "Empresa Excluída", variant: "destructive" },
  transaction_created: { label: "Lançamento Criado", variant: "default" },
  transaction_updated: { label: "Lançamento Atualizado", variant: "secondary" },
  transaction_deleted: { label: "Lançamento Excluído", variant: "destructive" },
  contact_created: { label: "Contato Criado", variant: "default" },
  contact_updated: { label: "Contato Atualizado", variant: "secondary" },
  contact_deleted: { label: "Contato Excluído", variant: "destructive" },
  account_created: { label: "Conta Criada", variant: "default" },
  account_updated: { label: "Conta Atualizada", variant: "secondary" },
  account_deleted: { label: "Conta Excluída", variant: "destructive" },
  category_created: { label: "Categoria Criada", variant: "default" },
  category_updated: { label: "Categoria Atualizada", variant: "secondary" },
  category_deleted: { label: "Categoria Excluída", variant: "destructive" },
  bill_created: { label: "Conta a Pagar Criada", variant: "default" },
};

const ALL_ACTIONS = "all";
const PAGE_SIZE = 20;

/** Rótulo legível para ações sem tradução cadastrada (snake_case → Texto). */
function humanizeAction(action: string) {
  return action
    .split("_")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function actionInfoOf(action: string) {
  return actionLabels[action] ?? { label: humanizeAction(action), variant: "outline" as const };
}

export function AdminAuditLogs() {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState(ALL_ACTIONS);
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();
  const [page, setPage] = useState(0);

  // Debounce do campo de busca (evita 1 query a cada tecla)
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput);
      setPage(0);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Ações existentes no banco (para não limitar o filtro a uma lista fixa)
  const { data: actionOptions } = useQuery({
    queryKey: ["admin-audit-log-actions"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_logs")
        .select("action")
        .order("created_at", { ascending: false })
        .limit(2000);
      if (error) throw error;
      const set = new Set<string>([...Object.keys(actionLabels), ...(data ?? []).map((r) => r.action)]);
      return Array.from(set).sort((a, b) => actionInfoOf(a).label.localeCompare(actionInfoOf(b).label, "pt-BR"));
    },
  });


  const queryKey = [
    "admin-audit-logs",
    { page, search, actionFilter, dateFrom: dateFrom?.toISOString(), dateTo: dateTo?.toISOString() },
  ];

  const { data, isLoading, isFetching } = useQuery({
    queryKey,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      let q = supabase
        .from("audit_logs")
        .select("id, created_at, user_name, action, entity_type, entity_id, details", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

      if (actionFilter !== ALL_ACTIONS) {
        q = q.eq("action", actionFilter);
      }
      if (dateFrom) {
        q = q.gte("created_at", startOfDay(dateFrom).toISOString());
      }
      if (dateTo) {
        q = q.lte("created_at", endOfDay(dateTo).toISOString());
      }
      if (search) {
        // busca em user_name, action e entity_type
        const term = `%${search}%`;
        q = q.or(
          `user_name.ilike.${term},action.ilike.${term},entity_type.ilike.${term},entity_id.ilike.${term}`,
        );
      }

      const { data, error, count } = await q;
      if (error) throw error;
      return { rows: data ?? [], total: count ?? 0 };
    },
  });

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);

  const hasFilters = search || actionFilter !== ALL_ACTIONS || dateFrom || dateTo;

  const clearFilters = () => {
    setSearchInput("");
    setSearch("");
    setActionFilter(ALL_ACTIONS);
    setDateFrom(undefined);
    setDateTo(undefined);
    setPage(0);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-end gap-2 sm:gap-3">
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-9"
          />
        </div>

        <Select value={actionFilter} onValueChange={(v) => { setActionFilter(v); setPage(0); }}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="Tipo de ação" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_ACTIONS}>Todas as ações</SelectItem>
            {(actionOptions ?? Object.keys(actionLabels)).map((action) => (
              <SelectItem key={action} value={action}>
                {actionInfoOf(action).label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className={cn("flex-1 sm:w-[150px] justify-start text-left font-normal", !dateFrom && "text-muted-foreground")}>
                <CalendarIcon className="mr-2 h-4 w-4" />
                {dateFrom ? format(dateFrom, "dd/MM/yyyy") : "Data início"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={dateFrom} onSelect={(v) => { setDateFrom(v); setPage(0); }} initialFocus className={cn("p-3 pointer-events-auto")} locale={ptBR} />
            </PopoverContent>
          </Popover>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className={cn("flex-1 sm:w-[150px] justify-start text-left font-normal", !dateTo && "text-muted-foreground")}>
                <CalendarIcon className="mr-2 h-4 w-4" />
                {dateTo ? format(dateTo, "dd/MM/yyyy") : "Data fim"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={dateTo} onSelect={(v) => { setDateTo(v); setPage(0); }} initialFocus className={cn("p-3 pointer-events-auto")} locale={ptBR} />
            </PopoverContent>
          </Popover>
        </div>

        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="min-h-9">
            <X className="mr-1 h-4 w-4" /> Limpar
          </Button>
        )}
      </div>

      {/* Desktop */}
      <div className={cn("hidden md:block rounded-md border transition-opacity", isFetching && !isLoading && "opacity-60")}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data/Hora</TableHead>
              <TableHead>Usuário</TableHead>
              <TableHead>Ação</TableHead>
              <TableHead>Entidade</TableHead>
              <TableHead>Detalhes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 5 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-24" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  Nenhum log encontrado
                </TableCell>
              </TableRow>
            ) : (
              rows.map((log) => {
                const actionInfo = actionInfoOf(log.action);
                const details = log.details as Record<string, string> | null;
                return (
                  <TableRow key={log.id}>
                    <TableCell className="text-muted-foreground whitespace-nowrap">
                      {formatDate(log.created_at, "dd/MM/yyyy HH:mm")}
                    </TableCell>
                    <TableCell className="font-medium">{log.user_name || "—"}</TableCell>
                    <TableCell>
                      <Badge variant={actionInfo.variant}>{actionInfo.label}</Badge>
                    </TableCell>
                    <TableCell className="capitalize">{log.entity_type}</TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                      {details?.target_name || log.entity_id || "—"}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Mobile */}
      <div className={cn("md:hidden space-y-2 transition-opacity", isFetching && !isLoading && "opacity-60")}>
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-md border p-3"><Skeleton className="h-16 w-full" /></div>
          ))
        ) : rows.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-8">Nenhum log encontrado</p>
        ) : (
          rows.map((log) => {
            const actionInfo = actionInfoOf(log.action);
            const details = log.details as Record<string, string> | null;
            return (
              <div key={log.id} className="rounded-md border p-3 space-y-1.5">
                <div className="flex items-start justify-between gap-2">
                  <Badge variant={actionInfo.variant} className="text-[10px]">{actionInfo.label}</Badge>
                  <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                    {formatDate(log.created_at, "dd/MM/yy HH:mm")}
                  </span>
                </div>
                <p className="text-sm font-medium truncate">{log.user_name || "—"}</p>
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span className="capitalize">{log.entity_type}</span>
                  <span className="truncate ml-2 max-w-[60%] text-right">{details?.target_name || log.entity_id || "—"}</span>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Pagination */}
      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-[11px] sm:text-xs text-muted-foreground">
            {safePage * PAGE_SIZE + 1}–{Math.min((safePage + 1) * PAGE_SIZE, total)} de {total}
          </p>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-9 w-9" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-xs px-2 text-muted-foreground">
              {safePage + 1} / {totalPages}
            </span>
            <Button variant="outline" size="icon" className="h-9 w-9" disabled={safePage >= totalPages - 1} onClick={() => setPage(safePage + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
