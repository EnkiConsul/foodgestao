import { useState, useEffect, useMemo } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Search, CalendarIcon, X, ChevronLeft, ChevronRight, Info } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format, startOfDay, endOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { formatDate } from "@/lib/date-utils";
import { cn } from "@/lib/utils";
import { useUserNames } from "@/hooks/useUserNames";
import { ACCESS_ACTIONS } from "@/lib/audit";

const actionLabels: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  user_activated: { label: "Usuário Ativado", variant: "default" },
  user_deactivated: { label: "Usuário Desativado", variant: "destructive" },
  user_signed_in: { label: "Entrada no Sistema", variant: "default" },
  user_signed_out: { label: "Saída do Sistema", variant: "outline" },
  user_password_changed: { label: "Senha Alterada", variant: "secondary" },
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
  dp_colaboradores_created: { label: "Colaborador Criado", variant: "default" },
  dp_colaboradores_updated: { label: "Colaborador Atualizado", variant: "secondary" },
  dp_colaboradores_deleted: { label: "Colaborador Excluído", variant: "destructive" },
  dp_cargos_created: { label: "Cargo Criado", variant: "default" },
  dp_cargos_updated: { label: "Cargo Atualizado", variant: "secondary" },
  dp_cargos_deleted: { label: "Cargo Excluído", variant: "destructive" },
  dp_setores_created: { label: "Setor Criado", variant: "default" },
  dp_setores_updated: { label: "Setor Atualizado", variant: "secondary" },
  dp_setores_deleted: { label: "Setor Excluído", variant: "destructive" },
  dp_unidades_created: { label: "Unidade Criada", variant: "default" },
  dp_unidades_updated: { label: "Unidade Atualizada", variant: "secondary" },
  dp_unidades_deleted: { label: "Unidade Excluída", variant: "destructive" },
  dp_turnos_created: { label: "Turno Criado", variant: "default" },
  dp_turnos_updated: { label: "Turno Atualizado", variant: "secondary" },
  dp_turnos_deleted: { label: "Turno Excluído", variant: "destructive" },
  dp_jornadas_created: { label: "Jornada Criada", variant: "default" },
  dp_jornadas_updated: { label: "Jornada Atualizada", variant: "secondary" },
  dp_jornadas_deleted: { label: "Jornada Excluída", variant: "destructive" },
  dp_sindicatos_created: { label: "Sindicato Criado", variant: "default" },
  dp_sindicatos_updated: { label: "Sindicato Atualizado", variant: "secondary" },
  dp_sindicatos_deleted: { label: "Sindicato Excluído", variant: "destructive" },
  dp_documentos_created: { label: "Documento Enviado", variant: "default" },
  dp_documentos_updated: { label: "Documento Atualizado", variant: "secondary" },
  dp_documentos_deleted: { label: "Documento Excluído", variant: "destructive" },
  dp_folgas_created: { label: "Folga Criada", variant: "default" },
  dp_folgas_updated: { label: "Folga Atualizada", variant: "secondary" },
  dp_folgas_deleted: { label: "Folga Excluída", variant: "destructive" },
  dp_ferias_gozos_created: { label: "Férias Agendadas", variant: "default" },
  dp_ferias_gozos_updated: { label: "Férias Atualizadas", variant: "secondary" },
  dp_ferias_gozos_deleted: { label: "Férias Excluídas", variant: "destructive" },
  dp_trocas_created: { label: "Troca Criada", variant: "default" },
  dp_trocas_updated: { label: "Troca Atualizada", variant: "secondary" },
  dp_convocacoes_created: { label: "Convocação Criada", variant: "default" },
  dp_convocacoes_updated: { label: "Convocação Atualizada", variant: "secondary" },
  dp_escalas_created: { label: "Escala Criada", variant: "default" },
  dp_escalas_updated: { label: "Escala Atualizada", variant: "secondary" },
  company_invites_created: { label: "Convite Enviado", variant: "default" },
  company_invites_updated: { label: "Convite Atualizado", variant: "secondary" },
  company_invites_deleted: { label: "Convite Excluído", variant: "destructive" },
  company_members_created: { label: "Membro Adicionado", variant: "default" },
  company_members_updated: { label: "Permissões Alteradas", variant: "secondary" },
  company_members_deleted: { label: "Membro Removido", variant: "destructive" },
  company_modules_created: { label: "Módulo Contratado", variant: "default" },
  company_modules_updated: { label: "Módulo Atualizado", variant: "secondary" },
  credit_cards_created: { label: "Cartão Criado", variant: "default" },
  credit_cards_updated: { label: "Cartão Atualizado", variant: "secondary" },
  credit_cards_deleted: { label: "Cartão Excluído", variant: "destructive" },
  budgets_created: { label: "Orçamento Criado", variant: "default" },
  budgets_updated: { label: "Orçamento Atualizado", variant: "secondary" },
  budgets_deleted: { label: "Orçamento Excluído", variant: "destructive" },
  cost_centers_created: { label: "Centro de Custo Criado", variant: "default" },
  cost_centers_updated: { label: "Centro de Custo Atualizado", variant: "secondary" },
  cost_centers_deleted: { label: "Centro de Custo Excluído", variant: "destructive" },
  payment_methods_created: { label: "Forma de Pagamento Criada", variant: "default" },
  payment_methods_updated: { label: "Forma de Pagamento Atualizada", variant: "secondary" },
  payment_methods_deleted: { label: "Forma de Pagamento Excluída", variant: "destructive" },
  tags_created: { label: "Etiqueta Criada", variant: "default" },
  tags_updated: { label: "Etiqueta Atualizada", variant: "secondary" },
  tags_deleted: { label: "Etiqueta Excluída", variant: "destructive" },
};

const ALL_ACTIONS = "all";
const ALL_USERS = "all";
const PAGE_SIZE = 20;
const ACCESS_LIST = [...ACCESS_ACTIONS] as string[];

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
  const [tab, setTab] = useState<"acoes" | "acessos">("acoes");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState(ALL_ACTIONS);
  const [userFilter, setUserFilter] = useState(ALL_USERS);
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();
  const [page, setPage] = useState(0);
  const { realName } = useUserNames();

  // Debounce do campo de busca (evita 1 query a cada tecla)
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput);
      setPage(0);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Ações existentes no banco (para não limitar o filtro a uma lista fixa)
  const { data: recent } = useQuery({
    queryKey: ["admin-audit-log-facets"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_logs")
        .select("action, user_id, user_name")
        .order("created_at", { ascending: false })
        .limit(2000);
      if (error) throw error;
      return data ?? [];
    },
  });

  const actionOptions = useMemo(() => {
    const set = new Set<string>([...Object.keys(actionLabels), ...(recent ?? []).map((r) => r.action)]);
    return Array.from(set)
      .filter((a) => (tab === "acessos" ? ACCESS_LIST.includes(a) : !ACCESS_LIST.includes(a)))
      .sort((a, b) => actionInfoOf(a).label.localeCompare(actionInfoOf(b).label, "pt-BR"));
  }, [recent, tab]);

  const userOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of recent ?? []) {
      if (!r.user_id) continue;
      if (!map.has(r.user_id)) {
        map.set(r.user_id, realName(r.user_id) || r.user_name || `${r.user_id.slice(0, 8)}…`);
      }
    }
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1], "pt-BR"));
  }, [recent, realName]);

  const queryKey = [
    "admin-audit-logs",
    {
      tab,
      page,
      search,
      actionFilter,
      userFilter,
      dateFrom: dateFrom?.toISOString(),
      dateTo: dateTo?.toISOString(),
    },
  ];

  const { data, isLoading, isFetching } = useQuery({
    queryKey,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      let q = supabase
        .from("audit_logs")
        .select("id, created_at, user_id, user_name, action, entity_type, entity_id, details", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

      if (actionFilter !== ALL_ACTIONS) {
        q = q.eq("action", actionFilter);
      } else if (tab === "acessos") {
        q = q.in("action", ACCESS_LIST);
      } else {
        q = q.not("action", "in", `(${ACCESS_LIST.join(",")})`);
      }
      if (userFilter !== ALL_USERS) {
        q = q.eq("user_id", userFilter);
      }
      if (dateFrom) {
        q = q.gte("created_at", startOfDay(dateFrom).toISOString());
      }
      if (dateTo) {
        q = q.lte("created_at", endOfDay(dateTo).toISOString());
      }
      if (search) {
        // busca em user_name, ação, entidade e id da entidade
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

  const hasFilters = search || actionFilter !== ALL_ACTIONS || userFilter !== ALL_USERS || dateFrom || dateTo;

  const clearFilters = () => {
    setSearchInput("");
    setSearch("");
    setActionFilter(ALL_ACTIONS);
    setUserFilter(ALL_USERS);
    setDateFrom(undefined);
    setDateTo(undefined);
    setPage(0);
  };

  /** Nome de quem agiu: nome atual do cadastro, com o registrado como reserva. */
  const whoOf = (log: { user_id: string; user_name: string | null }) =>
    realName(log.user_id) || log.user_name || `${log.user_id.slice(0, 8)}…`;

  return (
    <div className="space-y-4">
      <Tabs
        value={tab}
        onValueChange={(v) => {
          setTab(v as "acoes" | "acessos");
          setActionFilter(ALL_ACTIONS);
          setPage(0);
        }}
      >
        <TabsList>
          <TabsTrigger value="acoes">Ações</TabsTrigger>
          <TabsTrigger value="acessos">Acessos</TabsTrigger>
        </TabsList>
      </Tabs>

      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
        {tab === "acoes"
          ? "A lista mostra as ações registradas no sistema. Rotinas automáticas do servidor aparecem sem responsável."
          : "Entradas e saídas do sistema e trocas de senha registradas a partir de agora."}
      </p>

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

        <Select value={userFilter} onValueChange={(v) => { setUserFilter(v); setPage(0); }}>
          <SelectTrigger className="w-full sm:w-[200px]">
            <SelectValue placeholder="Usuário" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_USERS}>Todos os usuários</SelectItem>
            {userOptions.map(([id, name]) => (
              <SelectItem key={id} value={id}>{name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={actionFilter} onValueChange={(v) => { setActionFilter(v); setPage(0); }}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="Tipo de ação" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_ACTIONS}>Todas as ações</SelectItem>
            {actionOptions.map((action) => (
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
                  Nenhum registro encontrado
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
                    <TableCell className="font-medium">{whoOf(log)}</TableCell>
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
          <p className="text-center text-sm text-muted-foreground py-8">Nenhum registro encontrado</p>
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
                <p className="text-sm font-medium truncate">{whoOf(log)}</p>
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
