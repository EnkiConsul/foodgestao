import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { usePrivacy } from "@/hooks/usePrivacy";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { ArrowLeft, Check, RefreshCw, Search, X, AlertTriangle, Loader2 } from "lucide-react";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import { CATEGORY_INDENT_STEP, categoryGuideLevels } from "@/lib/categories/display";
import { CategoryTypeBadge } from "@/components/categorias/CategoryTypeBadge";
import { buildCategoryTree, type Category } from "@/lib/categories/tree";

interface StagingRow {
  id: string;
  connection_id: string;
  pluggy_account_id: string;
  date: string;
  description: string | null;
  amount: number;
  type: string | null;
  category_pluggy: string | null;
  status: "pending" | "confirmed" | "ignored" | "duplicate";
  suggested_account_id: string | null;
  suggested_category_id: string | null;
  matched_transaction_id?: string | null;
}

interface Connection {
  id: string;
  connector_name: string | null;
  connector_image_url: string | null;
  status: string;
  last_synced_at: string | null;
}

interface AccountOpt { id: string; name: string; }
interface CategoryOpt {
  id: string;
  name: string;
  transaction_type: string;
  parent_id: string | null;
  sort_order: number | null;
  color: string | null;
  is_active?: boolean | null;
}
interface ScopeInfo { pluggyAccountId: string; connectionId: string; name: string | null; }

/**
 * Monta as opções do seletor usando a MESMA árvore da página /categorias
 * (helper compartilhado). Itens cujo pai não está vinculado à empresa não são
 * promovidos a raiz — ficam de fora, exatamente como em /categorias.
 * O filtro por tipo preserva os pais quando existe filho do tipo desejado.
 * Categorias bloqueadas (is_active = false) continuam visíveis como estrutura,
 * mas não podem ser selecionadas.
 */
function buildCategoryOptions(cats: CategoryOpt[], type: string): { cat: CategoryOpt; depth: number }[] {
  const nodes = buildCategoryTree(cats as unknown as Category[]) as unknown as (CategoryOpt & { depth: number })[];
  const keep = new Set<string>();
  // percorre de baixo para cima: se o nó é do tipo (ou tem filho mantido), mantém e sobe para o pai
  for (let i = nodes.length - 1; i >= 0; i--) {
    const n = nodes[i];
    if (n.transaction_type === type || keep.has(n.id)) {
      keep.add(n.id);
      if (n.parent_id) keep.add(n.parent_id);
    }
  }
  return nodes.filter((n) => keep.has(n.id)).map((n) => ({ cat: n, depth: n.depth }));
}

/** Itens do seletor de categoria (mesma apresentação da página /categorias). */
function renderCategoryItems(options: { cat: CategoryOpt; depth: number }[]) {
  return options.map(({ cat, depth }) => (
    <SelectItem key={cat.id} value={cat.id} disabled={cat.is_active === false}>
      <span className="flex items-center gap-2 min-w-0">
        <span className="flex shrink-0" aria-hidden>
          {categoryGuideLevels(depth).map((i) => (
            <span
              key={i}
              className="inline-block border-l border-border/60 h-4"
              style={{ width: CATEGORY_INDENT_STEP }}
            />
          ))}
        </span>
        <span
          className="h-2.5 w-2.5 rounded-full shrink-0"
          style={{ backgroundColor: cat.color ?? "#94a3b8" }}
          aria-hidden
        />
        <span className={cn("truncate", depth === 0 && "font-semibold")}>{cat.name}</span>
        <CategoryTypeBadge type={cat.transaction_type} className="ml-1 shrink-0" />
        {cat.is_active === false && (
          <Badge variant="secondary" className="ml-1 h-4 px-1.5 text-[10px] shrink-0">Bloqueada</Badge>
        )}
      </span>
    </SelectItem>
  ));
}


export default function ConciliacaoPluggy() {
  const navigate = useNavigate();
  const { contextType, selectedCompanyId } = useCompanyContext();
  const { maskBRL } = usePrivacy();

  const [searchParams] = useSearchParams();
  const scopedLocalAccountId = searchParams.get("account");

  const [connections, setConnections] = useState<Connection[]>([]);
  const [connectionId, setConnectionId] = useState<string>("all");
  const [rows, setRows] = useState<StagingRow[]>([]);
  const [accounts, setAccounts] = useState<AccountOpt[]>([]);
  const [categories, setCategories] = useState<CategoryOpt[]>([]);
  const categoryOptionsReceita = useMemo(() => buildCategoryOptions(categories, "entrada"), [categories]);
  const categoryOptionsDespesa = useMemo(() => buildCategoryOptions(categories, "saida"), [categories]);
  const categoryTypeById = useMemo(() => {
    const m: Record<string, string> = {};
    for (const c of categories) m[c.id] = c.transaction_type;
    return m;
  }, [categories]);

  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("pending");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [rowAccount, setRowAccount] = useState<Record<string, string>>({});
  const [rowCategory, setRowCategory] = useState<Record<string, string>>({});
  /** "auto" = entrada/saída; "transfer" = transferência entre contas */
  const [rowKind, setRowKind] = useState<Record<string, "auto" | "transfer">>({});
  const [rowCounterpart, setRowCounterpart] = useState<Record<string, string>>({});
  const [transferTxIds, setTransferTxIds] = useState<Set<string>>(new Set());
  const [rowBusy, setRowBusy] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState<null | "confirm" | "ignore">(null);

  // Escopo travado por conta (quando entrou pelo card da conta bancária)
  const [scope, setScope] = useState<ScopeInfo | null>(null);
  const [scopeUnresolved, setScopeUnresolved] = useState(false);
  const [linkedByPluggyAccount, setLinkedByPluggyAccount] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!selectedCompanyId) { setLoading(false); return; }
    setLoading(true);

    // Resolve o escopo por conta antes de montar a query de staging
    let resolvedScope: ScopeInfo | null = null;
    if (scopedLocalAccountId) {
      const { data: pa } = await supabase
        .from("pluggy_accounts")
        .select("pluggy_account_id, connection_id, name")
        .eq("company_id", selectedCompanyId)
        .eq("linked_account_id", scopedLocalAccountId)
        .maybeSingle();
      if (pa) {
        resolvedScope = {
          pluggyAccountId: pa.pluggy_account_id,
          connectionId: pa.connection_id,
          name: pa.name ?? null,
        };
      }
    }
    setScope(resolvedScope);
    setScopeUnresolved(!!scopedLocalAccountId && !resolvedScope);
    setConnectionId(resolvedScope ? resolvedScope.connectionId : "all");

    let stagingQuery = supabase.from("pluggy_staging_transactions")
      .select("*")
      .eq("company_id", selectedCompanyId);
    if (resolvedScope) {
      stagingQuery = stagingQuery.eq("pluggy_account_id", resolvedScope.pluggyAccountId);
    }

    const [{ data: conns }, { data: staging }, { data: accs }, { data: cats }, { data: pluggyAccts }] = await Promise.all([
      supabase.from("pluggy_connections")
        .select("id, connector_name, connector_image_url, status, last_synced_at")
        .eq("company_id", selectedCompanyId).order("created_at", { ascending: false }),
      stagingQuery.order("date", { ascending: false }).limit(500),
      supabase.rpc("get_accessible_accounts", {
        _context: "pj", _company_id: selectedCompanyId, _include_inactive: false,
      }),
      supabase.from("categories")
        .select("id, name, transaction_type, parent_id, sort_order, color, is_active, category_companies!inner(company_id)")
        .or("context.is.null,context.eq.pj")
        .eq("category_companies.company_id", selectedCompanyId)

        .order("parent_id", { nullsFirst: true })
        .order("sort_order")
        .order("name"),
      supabase.from("pluggy_accounts")
        .select("pluggy_account_id, linked_account_id")
        .eq("company_id", selectedCompanyId),
    ]);

    setConnections((conns ?? []) as Connection[]);
    setRows((staging ?? []) as StagingRow[]);
    setAccounts(((accs ?? []) as any[]).map((a) => ({ id: a.id, name: a.name })));
    setCategories((cats ?? []) as CategoryOpt[]);

    // Mapa: conta Pluggy -> conta bancária local vinculada
    const linkedMap: Record<string, string> = {};
    for (const pa of (pluggyAccts ?? []) as { pluggy_account_id: string; linked_account_id: string | null }[]) {
      if (pa.linked_account_id) linkedMap[pa.pluggy_account_id] = pa.linked_account_id;
    }
    setLinkedByPluggyAccount(linkedMap);

    // preload suggested selections
    const acctMap: Record<string, string> = {};
    const catMap: Record<string, string> = {};
    for (const r of (staging ?? []) as StagingRow[]) {
      const fallback = linkedMap[r.pluggy_account_id];
      const target = r.suggested_account_id ?? fallback;
      if (target) acctMap[r.id] = target;
      if (r.suggested_category_id) catMap[r.id] = r.suggested_category_id;
    }
    setRowAccount((prev) => ({ ...acctMap, ...prev }));
    setRowCategory((prev) => ({ ...catMap, ...prev }));

    // Marca quais lançamentos já conciliados viraram transferência (para o badge)
    const matchedIds = ((staging ?? []) as StagingRow[])
      .map((r) => r.matched_transaction_id)
      .filter((v): v is string => !!v);
    if (matchedIds.length > 0) {
      const { data: txs } = await supabase
        .from("transactions")
        .select("id")
        .in("id", matchedIds.slice(0, 500))
        .eq("transaction_type", "transferencia");
      setTransferTxIds(new Set(((txs ?? []) as { id: string }[]).map((t) => t.id)));
    } else {
      setTransferTxIds(new Set());
    }
    setLoading(false);
  }, [selectedCompanyId, scopedLocalAccountId]);

  useEffect(() => { load(); }, [load]);

  const syncNow = async () => {
    const targets = scope
      ? connections.filter((c) => c.id === scope.connectionId)
      : connectionId === "all" ? connections : connections.filter((c) => c.id === connectionId);
    if (targets.length === 0) return;
    setSyncing(true);
    let total = 0;
    let needsAction = false;
    for (const c of targets) {
      const { data: conn } = await supabase.from("pluggy_connections").select("pluggy_item_id").eq("id", c.id).single();
      if (!conn) continue;
      const { data, error } = await supabase.functions.invoke("pluggy-sync-item", {
        body: { item_id: conn.pluggy_item_id, company_id: selectedCompanyId },
      });
      if (error) { toast.error(`Erro ao sincronizar ${c.connector_name ?? ""}`); continue; }
      const st = String(data?.item_status ?? "").toUpperCase();
      if (st === "WAITING_USER_INPUT" || st === "LOGIN_ERROR") {
        needsAction = true;
        toast.error(`${c.connector_name ?? "Conexão"}: reconecte o banco (${st === "LOGIN_ERROR" ? "credenciais inválidas" : "confirmação pendente no app do banco"})`);
      }
      total += data?.transactions ?? 0;
    }
    setSyncing(false);
    if (!needsAction) toast.success(`Sincronização concluída (${total} lançamentos)`);
    load();

  };

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (connectionId !== "all" && r.connection_id !== connectionId) return false;
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (search && !(r.description ?? "").toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [rows, connectionId, statusFilter, search]);

  const counts = useMemo(() => ({
    pending: rows.filter((r) => r.status === "pending").length,
    confirmed: rows.filter((r) => r.status === "confirmed").length,
    ignored: rows.filter((r) => r.status === "ignored").length,
  }), [rows]);

  const pendingFiltered = useMemo(() => filtered.filter((r) => r.status === "pending"), [filtered]);
  const allPendingSelected = pendingFiltered.length > 0 && pendingFiltered.every((r) => selected.has(r.id));
  const somePendingSelected = pendingFiltered.some((r) => selected.has(r.id));

  const toggleAll = () => {
    if (allPendingSelected) setSelected(new Set());
    else setSelected(new Set(pendingFiltered.map((r) => r.id)));
  };


  const confirmIds = async (ids: string[]) => {
    if (ids.length === 0) return;

    // Group by target account
    const byAccount: Record<string, string[]> = {};
    for (const id of ids) {
      const acctId = rowAccount[id] ?? linkedByPluggyAccount[rows.find((r) => r.id === id)?.pluggy_account_id ?? ""];
      if (!acctId) { toast.error("Selecione a conta de destino para todos os itens"); return; }
      byAccount[acctId] = byAccount[acctId] ?? [];
      byAccount[acctId].push(id);
    }

    // Transferências exigem a conta contraparte
    for (const id of ids) {
      if (rowKind[id] === "transfer" && !rowCounterpart[id]) {
        toast.error("Selecione a conta da contraparte nas transferências");
        return;
      }
    }

    let ok = 0;
    let mirrors = 0;
    for (const [acctId, staging_ids] of Object.entries(byAccount)) {
      const transferIds = staging_ids.filter((sid) => rowKind[sid] === "transfer");
      const normalIds = staging_ids.filter((sid) => rowKind[sid] !== "transfer");

      // Transferências: uma chamada por conta contraparte
      const byCounterpart: Record<string, string[]> = {};
      for (const sid of transferIds) {
        const cp = rowCounterpart[sid]!;
        byCounterpart[cp] = byCounterpart[cp] ?? [];
        byCounterpart[cp].push(sid);
      }
      for (const [cp, sids] of Object.entries(byCounterpart)) {
        if (cp === acctId) { toast.error("A contraparte deve ser diferente da conta do extrato"); continue; }
        const { data, error } = await supabase.rpc("pluggy_confirm_staging_transfer", {
          p_staging_ids: sids,
          p_account_id: acctId,
          p_counterpart_account_id: cp,
        });
        if (error) { toast.error("Falha ao confirmar transferência: " + error.message); continue; }
        const list = (Array.isArray(data) ? data : []) as { mirror_staging_id: string | null }[];
        ok += list.length;
        mirrors += list.filter((d) => d.mirror_staging_id).length;
      }

      // Lançamentos comuns: uma chamada por (conta, categoria)
      const byCat: Record<string, string[]> = {};
      for (const sid of normalIds) {
        const cat = rowCategory[sid] ?? "__none__";
        byCat[cat] = byCat[cat] ?? [];
        byCat[cat].push(sid);
      }
      for (const [cat, sids] of Object.entries(byCat)) {
        const { data, error } = await supabase.rpc("pluggy_confirm_staging", {
          p_staging_ids: sids,
          p_account_id: acctId,
          p_category_id: cat === "__none__" ? null : cat,
        });
        if (error) { toast.error("Falha ao confirmar: " + error.message); continue; }
        ok += Array.isArray(data) ? data.length : 0;
      }
    }
    toast.success(ok === 1 ? "Lançamento confirmado" : `${ok} lançamentos confirmados`);
    if (mirrors > 0) {
      toast.info(
        mirrors === 1
          ? "A outra ponta da transferência foi marcada como duplicada"
          : `${mirrors} lançamentos espelho marcados como duplicados`,
      );
    }
    setSelected(new Set());
    load();
  };

  const ignoreIds = async (ids: string[]) => {
    if (ids.length === 0) return;
    const { error } = await supabase.rpc("pluggy_ignore_staging", { p_staging_ids: ids });
    if (error) { toast.error("Falha ao ignorar"); return; }
    toast.success(ids.length === 1 ? "Lançamento ignorado" : `${ids.length} lançamentos ignorados`);
    setSelected(new Set());
    load();
  };

  const confirmSelected = async () => {
    setBulkBusy("confirm");
    try { await confirmIds(Array.from(selected)); } finally { setBulkBusy(null); }
  };
  const ignoreSelected = async () => {
    setBulkBusy("ignore");
    try { await ignoreIds(Array.from(selected)); } finally { setBulkBusy(null); }
  };


  const handleRowAction = async (id: string, action: "confirm" | "ignore") => {
    setRowBusy(id);
    try {
      if (action === "confirm") await confirmIds([id]);
      else await ignoreIds([id]);
    } finally {
      setRowBusy(null);
    }
  };


  if (contextType !== "pj") {
    return (
      <Card><CardContent className="p-6 text-sm text-muted-foreground">
        A conciliação Open Finance está disponível apenas no contexto empresa (PJ).
      </CardContent></Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex items-start gap-2">
          <Button variant="ghost" size="icon" className="shrink-0" onClick={() => navigate("/contas-bancarias")} aria-label="Voltar">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
              {scope
                ? `Conciliação — ${scope.name ?? connections.find((c) => c.id === scope.connectionId)?.connector_name ?? "Conta"}`
                : "Conciliação Open Finance"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {scope
                ? "Lançamentos importados apenas desta conta bancária."
                : "Revise, categorize e confirme os lançamentos importados dos bancos conectados."}
            </p>
          </div>
        </div>
        <Button
          onClick={syncNow}
          disabled={syncing || connections.length === 0}
          variant="outline"
          className="w-full sm:ml-auto sm:w-auto"
        >
          {syncing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
          Sincronizar
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Card><CardContent className="p-3">
          <p className="text-[11px] text-muted-foreground sm:text-xs">Pendentes</p>
          <p className="text-base font-bold text-warning sm:text-lg">{counts.pending}</p>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <p className="text-[11px] text-muted-foreground sm:text-xs">Confirmados</p>
          <p className="text-base font-bold text-success sm:text-lg">{counts.confirmed}</p>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <p className="text-[11px] text-muted-foreground sm:text-xs">Ignorados</p>
          <p className="text-base font-bold text-muted-foreground sm:text-lg">{counts.ignored}</p>
        </CardContent></Card>
      </div>

      {scopeUnresolved && (
        <Card className="border-warning/50 bg-warning/10">
          <CardContent className="p-3 text-sm text-foreground flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-warning shrink-0" />
            Esta conta não possui vínculo com uma conexão Open Finance. Exibindo a fila completa da empresa.
          </CardContent>
        </Card>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        {!scope && (
          <Select value={connectionId} onValueChange={setConnectionId}>
            <SelectTrigger className="w-full sm:w-[220px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as conexões</SelectItem>
              {connections.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.connector_name ?? "Banco"}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="pending">Pendentes</SelectItem>
            <SelectItem value="confirmed">Confirmados</SelectItem>
            <SelectItem value="ignored">Ignorados</SelectItem>
            <SelectItem value="all">Todos</SelectItem>
          </SelectContent>
        </Select>
        <div className="relative w-full sm:flex-1 sm:min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar descrição..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
        </div>
      </div>


      {pendingFiltered.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-primary/40 bg-primary/5 p-2">
          <span className="text-sm" role="status" aria-live="polite">
            {selected.size > 0
              ? `${selected.size} de ${pendingFiltered.length} pendente(s) selecionado(s)`
              : `${pendingFiltered.length} lançamento(s) pendente(s)`}
          </span>
          {!allPendingSelected && (
            <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setSelected(new Set(pendingFiltered.map((r) => r.id)))}>
              Selecionar todos os pendentes
            </Button>
          )}
          {selected.size > 0 && (
            <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setSelected(new Set())}>
              Limpar seleção
            </Button>
          )}
          {selected.size > 0 && (
            <Select
              value=""
              onValueChange={(v) => {
                const ids = Array.from(selected);
                setRowKind((p) => {
                  const next = { ...p };
                  ids.forEach((id) => { next[id] = "transfer"; });
                  return next;
                });
                setRowCounterpart((p) => {
                  const next = { ...p };
                  ids.forEach((id) => { next[id] = v; });
                  return next;
                });
                toast.info(`${ids.length} lançamento(s) marcados como transferência`);
              }}
            >
              <SelectTrigger className="h-8 w-[240px] text-xs">
                <SelectValue placeholder="Marcar como transferência p/…" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <div className="ml-auto flex gap-2">
            <Button size="sm" variant="outline" onClick={ignoreSelected} disabled={selected.size === 0 || bulkBusy !== null}>
              {bulkBusy === "ignore"
                ? <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                : <X className="h-4 w-4 mr-1" />} Ignorar
            </Button>
            <Button size="sm" onClick={confirmSelected} disabled={selected.size === 0 || bulkBusy !== null}>
              {bulkBusy === "confirm"
                ? <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                : <Check className="h-4 w-4 mr-1" />} Confirmar selecionados
            </Button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="p-10 text-center text-sm text-muted-foreground">
          Nenhum lançamento encontrado com os filtros atuais.
        </CardContent></Card>
      ) : (
        <Card><CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="w-10 p-2">
                  <Checkbox
                    checked={allPendingSelected ? true : somePendingSelected ? "indeterminate" : false}
                    disabled={pendingFiltered.length === 0}
                    onCheckedChange={toggleAll}
                    aria-label="Selecionar todos os pendentes"
                  />

                </th>
                <th className="p-2 text-left">Data</th>
                <th className="p-2 text-left">Descrição</th>
                <th className="p-2 text-right">Valor</th>
                <th className="p-2 text-left">Conta destino</th>
                <th className="p-2 text-left">Tipo</th>
                <th className="p-2 text-left">Categoria / contraparte</th>
                <th className="p-2 text-center">Status</th>
                <th className="p-2 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const isEntrada = r.amount >= 0;
                const disabled = r.status !== "pending";
                return (
                  <tr key={r.id} className="border-t hover:bg-muted/30">
                    <td className="p-2">
                      <Checkbox
                        checked={selected.has(r.id)}
                        disabled={disabled}
                        onCheckedChange={(v) => {
                          setSelected((prev) => {
                            const next = new Set(prev);
                            if (v) next.add(r.id); else next.delete(r.id);
                            return next;
                          });
                        }}
                      />
                    </td>
                    <td className="p-2 whitespace-nowrap">{format(parseISO(r.date), "dd/MM/yyyy")}</td>
                    <td className="p-2 max-w-[280px] truncate" title={r.description ?? ""}>{r.description ?? "-"}</td>
                    <td className={`p-2 text-right font-medium whitespace-nowrap ${isEntrada ? "text-success" : "text-destructive"}`}>
                      {maskBRL(r.amount)}
                    </td>
                    <td className="p-2">
                      <Select
                        value={rowAccount[r.id] ?? linkedByPluggyAccount[r.pluggy_account_id] ?? ""}
                        onValueChange={(v) => setRowAccount((p) => ({ ...p, [r.id]: v }))}
                        disabled={disabled}
                      >
                        <SelectTrigger className="h-8 min-w-[180px] text-xs"><SelectValue placeholder="Selecionar…" /></SelectTrigger>
                        <SelectContent>
                          {accounts.map((a) => (
                            <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="p-2">
                      <Select
                        value={rowKind[r.id] ?? "auto"}
                        onValueChange={(v) => setRowKind((p) => ({ ...p, [r.id]: v as "auto" | "transfer" }))}
                        disabled={disabled}
                      >
                        <SelectTrigger className="h-8 min-w-[160px] text-xs" aria-label="Tipo do lançamento">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="auto">{isEntrada ? "Entrada" : "Saída"}</SelectItem>
                          <SelectItem value="transfer">Transferência entre contas</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="p-2">
                      {(rowKind[r.id] ?? "auto") === "transfer" ? (
                        <>
                          <Select
                            value={rowCounterpart[r.id] ?? ""}
                            onValueChange={(v) => setRowCounterpart((p) => ({ ...p, [r.id]: v }))}
                            disabled={disabled}
                          >
                            <SelectTrigger className="h-8 min-w-[180px] text-xs">
                              <SelectValue placeholder={isEntrada ? "Conta de origem…" : "Conta de destino…"} />
                            </SelectTrigger>
                            <SelectContent>
                              {accounts
                                .filter((a) => a.id !== (rowAccount[r.id] ?? linkedByPluggyAccount[r.pluggy_account_id]))
                                .map((a) => (
                                  <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                          <p className="mt-1 text-[10px] text-muted-foreground">
                            {isEntrada ? "Dinheiro recebido desta conta" : "Dinheiro enviado para esta conta"} — sem receita/despesa
                          </p>
                        </>
                      ) : (
                        <>
                          <Select
                            value={rowCategory[r.id] ?? ""}
                            onValueChange={(v) => setRowCategory((p) => ({ ...p, [r.id]: v }))}
                            disabled={disabled}
                          >
                            <SelectTrigger className="h-8 min-w-[160px] text-xs"><SelectValue placeholder="Sem categoria" /></SelectTrigger>
                            <SelectContent className="max-h-[420px]">
                              <SelectGroup>
                                <SelectLabel className="sticky top-0 z-10 bg-popover border-b text-[10px] uppercase tracking-wide text-muted-foreground">
                                  Sugeridas ({isEntrada ? "entradas" : "saídas"})
                                </SelectLabel>
                                {renderCategoryItems(isEntrada ? categoryOptionsReceita : categoryOptionsDespesa)}
                              </SelectGroup>
                              <SelectGroup>
                                <SelectLabel className="sticky top-0 z-10 bg-popover border-y text-[10px] uppercase tracking-wide text-warning">
                                  Outras categorias — {isEntrada ? "saídas" : "entradas"} (estorno)
                                </SelectLabel>
                                {renderCategoryItems(isEntrada ? categoryOptionsDespesa : categoryOptionsReceita)}
                              </SelectGroup>
                            </SelectContent>
                          </Select>
                          {rowCategory[r.id] &&
                            categoryTypeById[rowCategory[r.id]] === (isEntrada ? "saida" : "entrada") && (
                            <p className="mt-1 flex items-center gap-1 text-[10px] text-warning">
                              <AlertTriangle className="h-3 w-3" /> Estorno: categoria de tipo oposto ao valor
                            </p>
                          )}
                        </>
                      )}
                    </td>

                    <td className="p-2 text-center">
                      <div className="flex flex-wrap items-center justify-center gap-1">
                        {r.status === "pending" && <Badge variant="outline">Pendente</Badge>}
                        {r.status === "confirmed" && <Badge className="bg-success/15 text-success border-success/30">Confirmado</Badge>}
                        {r.status === "ignored" && <Badge variant="secondary">Ignorado</Badge>}
                        {r.status === "duplicate" && (
                          <Badge className="bg-warning/15 text-warning border-warning/30">
                            <AlertTriangle className="h-3 w-3 mr-1" />Duplicado
                          </Badge>
                        )}
                        {r.matched_transaction_id && transferTxIds.has(r.matched_transaction_id) && (
                          <Badge variant="secondary" className="text-[10px]">Transferência</Badge>
                        )}
                      </div>
                    </td>
                    <td className="p-2">
                      {r.status === "pending" ? (
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 px-2 text-muted-foreground hover:text-destructive"
                            disabled={rowBusy === r.id}
                            onClick={() => handleRowAction(r.id, "ignore")}
                            aria-label="Ignorar lançamento"
                            title="Ignorar"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            className="h-8 px-2"
                            disabled={rowBusy === r.id}
                            onClick={() => handleRowAction(r.id, "confirm")}
                            aria-label="Confirmar conciliação deste lançamento"
                            title="Confirmar"
                          >
                            {rowBusy === r.id
                              ? <Loader2 className="h-4 w-4 animate-spin" />
                              : <><Check className="h-4 w-4 mr-1" />Confirmar</>}
                          </Button>
                        </div>
                      ) : (
                        <span className="block text-right text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent></Card>
      )}
    </div>
  );
}
