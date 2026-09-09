import { useState, useEffect, useMemo } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Search, CalendarIcon, X, ChevronLeft, ChevronRight, Info, Download } from "lucide-react";
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
import { toast } from "sonner";

const actionLabels: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  user_activated: { label: "Usuário Ativado", variant: "default" },
  user_deactivated: { label: "Usuário Desativado", variant: "destructive" },
  user_signed_in: { label: "Entrada no Sistema", variant: "default" },
  user_signed_out: { label: "Saída do Sistema", variant: "outline" },
  user_session_resumed: { label: "Retomada de Sessão", variant: "outline" },
  user_password_changed: { label: "Senha Alterada", variant: "secondary" },
  company_created: { label: "Empresa Criada", variant: "default" },
  company_updated: { label: "Empresa Atualizada", variant: "secondary" },
  company_deleted: { label: "Empresa Excluída", variant: "destructive" },
  companies_created: { label: "Empresa Criada", variant: "default" },
  companies_updated: { label: "Empresa Atualizada", variant: "secondary" },
  companies_deleted: { label: "Empresa Excluída", variant: "destructive" },
  transaction_created: { label: "Lançamento Criado", variant: "default" },
  transaction_updated: { label: "Lançamento Atualizado", variant: "secondary" },
  transaction_deleted: { label: "Lançamento Excluído", variant: "destructive" },
  transactions_created: { label: "Lançamento Criado", variant: "default" },
  transactions_updated: { label: "Lançamento Atualizado", variant: "secondary" },
  transactions_deleted: { label: "Lançamento Excluído", variant: "destructive" },
  contact_created: { label: "Contato Criado", variant: "default" },
  contact_updated: { label: "Contato Atualizado", variant: "secondary" },
  contact_deleted: { label: "Contato Excluído", variant: "destructive" },
  contacts_created: { label: "Contato Criado", variant: "default" },
  contacts_updated: { label: "Contato Atualizado", variant: "secondary" },
  contacts_deleted: { label: "Contato Excluído", variant: "destructive" },
  account_created: { label: "Conta Criada", variant: "default" },
  account_updated: { label: "Conta Atualizada", variant: "secondary" },
  account_deleted: { label: "Conta Excluída", variant: "destructive" },
  accounts_created: { label: "Conta Criada", variant: "default" },
  accounts_updated: { label: "Conta Atualizada", variant: "secondary" },
  accounts_deleted: { label: "Conta Excluída", variant: "destructive" },
  category_created: { label: "Categoria Criada", variant: "default" },
  category_updated: { label: "Categoria Atualizada", variant: "secondary" },
  category_deleted: { label: "Categoria Excluída", variant: "destructive" },
  categories_created: { label: "Categoria Criada", variant: "default" },
  categories_updated: { label: "Categoria Atualizada", variant: "secondary" },
  categories_deleted: { label: "Categoria Excluída", variant: "destructive" },
  bill_created: { label: "Conta a Pagar Criada", variant: "default" },
  subscriptions_created: { label: "Assinatura Criada", variant: "default" },
  subscriptions_updated: { label: "Assinatura Atualizada", variant: "secondary" },
  invoices_created: { label: "Fatura Criada", variant: "default" },
  invoices_updated: { label: "Fatura Atualizada", variant: "secondary" },
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
  dp_documento_requisitos_created: { label: "Requisito de Documento Criado", variant: "default" },
  dp_documento_requisitos_updated: { label: "Requisito de Documento Atualizado", variant: "secondary" },
  dp_folgas_created: { label: "Folga Criada", variant: "default" },
  dp_folgas_updated: { label: "Folga Atualizada", variant: "secondary" },
  dp_folgas_deleted: { label: "Folga Excluída", variant: "destructive" },
  dp_ferias_gozos_created: { label: "Férias Agendadas", variant: "default" },
  dp_ferias_gozos_updated: { label: "Férias Atualizadas", variant: "secondary" },
  dp_ferias_gozos_deleted: { label: "Férias Excluídas", variant: "destructive" },
  dp_ferias_periodos_created: { label: "Período de Férias Criado", variant: "default" },
  dp_ferias_periodos_updated: { label: "Período de Férias Atualizado", variant: "secondary" },
  dp_trocas_created: { label: "Troca Criada", variant: "default" },
  dp_trocas_updated: { label: "Troca Atualizada", variant: "secondary" },
  dp_convocacoes_created: { label: "Convocação Criada", variant: "default" },
  dp_convocacoes_updated: { label: "Convocação Atualizada", variant: "secondary" },
  dp_escalas_created: { label: "Escala Criada", variant: "default" },
  dp_escalas_updated: { label: "Escala Atualizada", variant: "secondary" },
  dp_pontos_created: { label: "Marcação de Ponto", variant: "default" },
  dp_pontos_updated: { label: "Ponto Atualizado", variant: "secondary" },
  dp_pontos_deleted: { label: "Ponto Excluído", variant: "destructive" },
  dp_ponto_ajustes_created: { label: "Ajuste de Ponto Solicitado", variant: "default" },
  dp_ponto_ajustes_updated: { label: "Ajuste de Ponto Atualizado", variant: "secondary" },
  dp_folha_lancamentos_created: { label: "Lançamento de Folha Criado", variant: "default" },
  dp_folha_lancamentos_updated: { label: "Lançamento de Folha Atualizado", variant: "secondary" },
  dp_beneficios_created: { label: "Benefício Criado", variant: "default" },
  dp_beneficios_updated: { label: "Benefício Atualizado", variant: "secondary" },
  dp_colaborador_beneficios_created: { label: "Benefício Concedido", variant: "default" },
  dp_colaborador_beneficios_updated: { label: "Benefício do Colaborador Atualizado", variant: "secondary" },
  dp_dependentes_created: { label: "Dependente Criado", variant: "default" },
  dp_dependentes_updated: { label: "Dependente Atualizado", variant: "secondary" },
  dp_ocorrencias_created: { label: "Ocorrência Criada", variant: "default" },
  dp_ocorrencias_updated: { label: "Ocorrência Atualizada", variant: "secondary" },
  dp_solicitacoes_created: { label: "Solicitação Criada", variant: "default" },
  dp_solicitacoes_updated: { label: "Solicitação Atualizada", variant: "secondary" },
  dp_cadastro_solicitacoes_created: { label: "Solicitação de Cadastro Criada", variant: "default" },
  dp_cadastro_solicitacoes_updated: { label: "Solicitação de Cadastro Atualizada", variant: "secondary" },
  dp_config_dp_updated: { label: "Configuração de Pessoas Atualizada", variant: "secondary" },
  dp_pendencias_config_updated: { label: "Configuração de Pendências Atualizada", variant: "secondary" },
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
const ALL_COMPANIES = "all";
const ALL_ORIGINS = "all";
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

type AuditRow = {
  id: string;
  created_at: string;
  user_id: string;
  user_name: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: unknown;
  company_id: string | null;
  actor_kind: string | null;
};

export function AdminAuditLogs() {
  const [tab, setTab] = useState<"acoes" | "acessos">("acoes");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState(ALL_ACTIONS);
  const [userFilter, setUserFilter] = useState(ALL_USERS);
  const [companyFilter, setCompanyFilter] = useState(ALL_COMPANIES);
  const [originFilter, setOriginFilter] = useState(ALL_ORIGINS);
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();
  const [page, setPage] = useState(0);
  const [exporting, setExporting] = useState(false);
  const { realName, data: profilesMap } = useUserNames();

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
        .select("action")
        .order("created_at", { ascending: false })
        .limit(2000);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Empresas (clientes) do sistema
  const { data: companies } = useQuery({
    queryKey: ["admin-audit-companies"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.from("companies").select("id, name").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const companyNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of companies ?? []) map.set(c.id, c.name ?? "—");
    return map;
  }, [companies]);

  const companyOf = (id: string | null) =>
    id ? companyNames.get(id) || `${id.slice(0, 8)}…` : "—";

  const actionOptions = useMemo(() => {
    const set = new Set<string>([...Object.keys(actionLabels), ...(recent ?? []).map((r) => r.action)]);
    return Array.from(set)
      .filter((a) => (tab === "acessos" ? ACCESS_LIST.includes(a) : !ACCESS_LIST.includes(a)))
      .sort((a, b) => actionInfoOf(a).label.localeCompare(actionInfoOf(b).label, "pt-BR"));
  }, [recent, tab]);

  // Todos os usuários cadastrados (não só quem já tem registro)
  const userOptions = useMemo(() => {
    const list: Array<[string, string]> = [];
    profilesMap?.forEach((info, id) => {
      list.push([id, info.full_name || `${id.slice(0, 8)}…`]);
    });
    return list.sort((a, b) => a[1].localeCompare(b[1], "pt-BR"));
  }, [profilesMap]);

  const filters = {
    tab,
    search,
    actionFilter,
    userFilter,
    companyFilter,
    originFilter,
    dateFrom: dateFrom?.toISOString(),
    dateTo: dateTo?.toISOString(),
  };

  const applyFilters = <T extends { eq: unknown }>(query: T): T => {
    let q = query as any;
    if (actionFilter !== ALL_ACTIONS) {
      q = q.eq("action", actionFilter);
    } else if (tab === "acessos") {
      q = q.in("action", ACCESS_LIST);
    } else {
      q = q.not("action", "in", `(${ACCESS_LIST.join(",")})`);
    }
    if (userFilter !== ALL_USERS) q = q.eq("user_id", userFilter);
    if (companyFilter !== ALL_COMPANIES) q = q.eq("company_id", companyFilter);
    if (originFilter !== ALL_ORIGINS) q = q.eq("actor_kind", originFilter);
    if (dateFrom) q = q.gte("created_at", startOfDay(dateFrom).toISOString());
    if (dateTo) q = q.lte("created_at", endOfDay(dateTo).toISOString());
    if (search) {
      const term = `%${search}%`;
      q = q.or(
        `user_name.ilike.${term},action.ilike.${term},entity_type.ilike.${term},entity_id.ilike.${term}`,
      );
    }
    return q as T;
  };

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["admin-audit-logs", { ...filters, page }],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const q = applyFilters(
        supabase
          .from("audit_logs")
          .select(
            "id, created_at, user_id, user_name, action, entity_type, entity_id, details, company_id, actor_kind",
            { count: "exact" },
          )
          .order("created_at", { ascending: false })
          .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1) as any,
      );
      const { data, error, count } = await q;
      if (error) throw error;
      return { rows: (data ?? []) as AuditRow[], total: count ?? 0 };
    },
  });

  // Resumo do período filtrado (usuários e empresas distintas)
  const { data: resumo } = useQuery({
    queryKey: ["admin-audit-summary", filters],
    staleTime: 30_000,
    queryFn: async () => {
      const q = applyFilters(
        supabase.from("audit_logs").select("user_id, company_id").limit(5000) as any,
      );
      const { data, error } = await q;
      if (error) throw error;
      const rows = (data ?? []) as Array<{ user_id: string | null; company_id: string | null }>;
      return {
        usuarios: new Set(rows.map((r) => r.user_id).filter(Boolean)).size,
        empresas: new Set(rows.map((r) => r.company_id).filter(Boolean)).size,
      };
    },
  });

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);

  const hasFilters =
    search ||
    actionFilter !== ALL_ACTIONS ||
    userFilter !== ALL_USERS ||
    companyFilter !== ALL_COMPANIES ||
    originFilter !== ALL_ORIGINS ||
    dateFrom ||
    dateTo;

  const clearFilters = () => {
    setSearchInput("");
    setSearch("");
    setActionFilter(ALL_ACTIONS);
    setUserFilter(ALL_USERS);
    setCompanyFilter(ALL_COMPANIES);
    setOriginFilter(ALL_ORIGINS);
    setDateFrom(undefined);
    setDateTo(undefined);
    setPage(0);
  };

  /** Nome de quem agiu: nome atual do cadastro, com o registrado como reserva. */
  const whoOf = (log: Pick<AuditRow, "user_id" | "user_name" | "actor_kind">) => {
    if (!log.user_id) return log.user_name || "Sistema / Importação";
    return realName(log.user_id) || log.user_name || `${log.user_id.slice(0, 8)}…`;
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      const q = applyFilters(
        supabase
          .from("audit_logs")
          .select(
            "created_at, user_id, user_name, action, entity_type, entity_id, details, company_id, actor_kind",
          )
          .order("created_at", { ascending: false })
          .limit(5000) as any,
      );
      const { data, error } = await q;
      if (error) throw error;
      const list = (data ?? []) as AuditRow[];
      const header = ["Data/Hora", "Usuário", "Origem", "Empresa", "Ação", "Entidade", "Detalhe"];
      const lines = list.map((log) => {
        const details = log.details as Record<string, string> | null;
        return [
          formatDate(log.created_at, "dd/MM/yyyy HH:mm"),
          whoOf(log),
          log.actor_kind === "system" ? "Sistema" : "Usuário",
          companyOf(log.company_id),
          actionInfoOf(log.action).label,
          log.entity_type,
          details?.target_name || log.entity_id || "",
        ]
          .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`)
          .join(";");
      });
      const csv = "\uFEFF" + [header.join(";"), ...lines].join("\r\n");
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `auditoria-${format(new Date(), "yyyy-MM-dd-HHmm")}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Não foi possível exportar a lista.");
    } finally {
      setExporting(false);
    }
  };

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
          ? "A lista mostra as ações registradas no sistema. O histórico começa na data em que cada área passou a ser registrada; rotinas automáticas aparecem como Sistema."
          : "Entradas, saídas, retomadas de sessão e trocas de senha registradas a partir de agora."}
      </p>

      <div className="grid grid-cols-3 gap-2 sm:max-w-lg">
        <div className="rounded-md border p-2.5">
          <p className="text-[11px] text-muted-foreground">Registros</p>
          <p className="text-lg font-semibold">{total}</p>
        </div>
        <div className="rounded-md border p-2.5">
          <p className="text-[11px] text-muted-foreground">Usuários</p>
          <p className="text-lg font-semibold">{resumo?.usuarios ?? "—"}</p>
        </div>
        <div className="rounded-md border p-2.5">
          <p className="text-[11px] text-muted-foreground">Empresas</p>
          <p className="text-lg font-semibold">{resumo?.empresas ?? "—"}</p>
        </div>
      </div>

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

        <Select value={companyFilter} onValueChange={(v) => { setCompanyFilter(v); setPage(0); }}>
          <SelectTrigger className="w-full sm:w-[200px]">
            <SelectValue placeholder="Empresa" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_COMPANIES}>Todas as empresas</SelectItem>
            {(companies ?? []).map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={originFilter} onValueChange={(v) => { setOriginFilter(v); setPage(0); }}>
          <SelectTrigger className="w-full sm:w-[160px]">
            <SelectValue placeholder="Origem" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_ORIGINS}>Todas as origens</SelectItem>
            <SelectItem value="user">Usuário</SelectItem>
            <SelectItem value="system">Sistema</SelectItem>
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

        <Button variant="outline" size="sm" className="min-h-9" onClick={exportCsv} disabled={exporting || total === 0}>
          <Download className="mr-1 h-4 w-4" /> Exportar
        </Button>

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
              <TableHead>Empresa</TableHead>
              <TableHead>Ação</TableHead>
              <TableHead>Entidade</TableHead>
              <TableHead>Detalhes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 6 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-24" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
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
                    <TableCell className="font-medium">
                      <span className="flex items-center gap-1.5">
                        {whoOf(log)}
                        {log.actor_kind === "system" && (
                          <Badge variant="outline" className="text-[10px]">Sistema</Badge>
                        )}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[180px] truncate">
                      {companyOf(log.company_id)}
                    </TableCell>
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
                <p className="text-[11px] text-muted-foreground truncate">{companyOf(log.company_id)}</p>
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
