import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { usePrivacy } from "@/hooks/usePrivacy";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { ArrowLeft, Check, RefreshCw, Search, X, AlertTriangle, Loader2 } from "lucide-react";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import { CATEGORY_INDENT_STEP, categoryGuideLevels } from "@/lib/categories/display";
import { CategoryTypeBadge } from "@/components/categorias/CategoryTypeBadge";

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
}
interface ScopeInfo { pluggyAccountId: string; connectionId: string; name: string | null; }

/** Ordena categorias em árvore (raiz -> filhos) respeitando sort_order/nome. */
function buildCategoryOptions(cats: CategoryOpt[]): { cat: CategoryOpt; depth: number }[] {
  const byParent = new Map<string | null, CategoryOpt[]>();
  const ids = new Set(cats.map((c) => c.id));
  cats.forEach((c) => {
    const key = c.parent_id && ids.has(c.parent_id) ? c.parent_id : null;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key)!.push(c);
  });
  byParent.forEach((list) =>
    list.sort(
      (a, b) =>
        (a.sort_order ?? 0) - (b.sort_order ?? 0) ||
        (a.name ?? "").localeCompare(b.name ?? "", "pt-BR")
    )
  );
  const out: { cat: CategoryOpt; depth: number }[] = [];
  const walk = (parent: string | null, depth: number) => {
    (byParent.get(parent) ?? []).forEach((c) => {
      out.push({ cat: c, depth });
      walk(c.id, depth + 1);
    });
  };
  walk(null, 0);
  return out;
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
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("pending");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [rowAccount, setRowAccount] = useState<Record<string, string>>({});
  const [rowCategory, setRowCategory] = useState<Record<string, string>>({});
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
        .select("id, name, transaction_type, parent_id, sort_order, color, category_companies!inner(company_id)")
        .eq("category_companies.company_id", selectedCompanyId)
        .eq("is_active", true)
        .order("sort_order"),
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
    for (const c of targets) {
      const { data: conn } = await supabase.from("pluggy_connections").select("pluggy_item_id").eq("id", c.id).single();
      if (!conn) continue;
      const { data, error } = await supabase.functions.invoke("pluggy-sync-item", {
        body: { item_id: conn.pluggy_item_id, company_id: selectedCompanyId },
      });
      if (error) { toast.error(`Erro ao sincronizar ${c.connector_name ?? ""}`); continue; }
      total += data?.transactions ?? 0;
    }
    setSyncing(false);
    toast.success(`Sincronização concluída (${total} lançamentos)`);
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

  const toggleAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.filter((r) => r.status === "pending").map((r) => r.id)));
  };

  const confirmSelected = async () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;

    // Group by target account
    const byAccount: Record<string, string[]> = {};
    for (const id of ids) {
      const acctId = rowAccount[id] ?? linkedByPluggyAccount[rows.find((r) => r.id === id)?.pluggy_account_id ?? ""];
      if (!acctId) { toast.error("Selecione a conta de destino para todos os itens"); return; }
      byAccount[acctId] = byAccount[acctId] ?? [];
      byAccount[acctId].push(id);
    }

    let ok = 0;
    for (const [acctId, staging_ids] of Object.entries(byAccount)) {
      // All share same account, but categories may differ — call once per (account,category) group
      const byCat: Record<string, string[]> = {};
      for (const sid of staging_ids) {
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
    toast.success(`${ok} lançamentos confirmados`);
    setSelected(new Set());
    load();
  };

  const ignoreSelected = async () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    const { error } = await supabase.rpc("pluggy_ignore_staging", { p_staging_ids: ids });
    if (error) { toast.error("Falha ao ignorar"); return; }
    toast.success(`${ids.length} lançamentos ignorados`);
    setSelected(new Set());
    load();
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
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/contas-bancarias")} aria-label="Voltar">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight">
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
        <Button onClick={syncNow} disabled={syncing || connections.length === 0} variant="outline">
          {syncing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
          Sincronizar
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Card><CardContent className="p-3">
          <p className="text-xs text-muted-foreground">Pendentes</p>
          <p className="text-lg font-bold text-warning">{counts.pending}</p>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <p className="text-xs text-muted-foreground">Confirmados</p>
          <p className="text-lg font-bold text-success">{counts.confirmed}</p>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <p className="text-xs text-muted-foreground">Ignorados</p>
          <p className="text-lg font-bold text-muted-foreground">{counts.ignored}</p>
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

      <div className="flex flex-wrap gap-2">
        {!scope && (
          <Select value={connectionId} onValueChange={setConnectionId}>
            <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as conexões</SelectItem>
              {connections.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.connector_name ?? "Banco"}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="pending">Pendentes</SelectItem>
            <SelectItem value="confirmed">Confirmados</SelectItem>
            <SelectItem value="ignored">Ignorados</SelectItem>
            <SelectItem value="all">Todos</SelectItem>
          </SelectContent>
        </Select>
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar descrição..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
        </div>
      </div>

      {selected.size > 0 && (
        <div className="flex items-center gap-2 rounded-md border border-primary/40 bg-primary/5 p-2">
          <span className="text-sm">{selected.size} selecionado(s)</span>
          <div className="ml-auto flex gap-2">
            <Button size="sm" variant="outline" onClick={ignoreSelected}>
              <X className="h-4 w-4 mr-1" /> Ignorar
            </Button>
            <Button size="sm" onClick={confirmSelected}>
              <Check className="h-4 w-4 mr-1" /> Confirmar
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
                    checked={filtered.length > 0 && filtered.every((r) => selected.has(r.id))}
                    onCheckedChange={toggleAll}
                    aria-label="Selecionar todos"
                  />
                </th>
                <th className="p-2 text-left">Data</th>
                <th className="p-2 text-left">Descrição</th>
                <th className="p-2 text-right">Valor</th>
                <th className="p-2 text-left">Conta destino</th>
                <th className="p-2 text-left">Categoria</th>
                <th className="p-2 text-center">Status</th>
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
                        value={rowCategory[r.id] ?? ""}
                        onValueChange={(v) => setRowCategory((p) => ({ ...p, [r.id]: v }))}
                        disabled={disabled}
                      >
                        <SelectTrigger className="h-8 min-w-[160px] text-xs"><SelectValue placeholder="Sem categoria" /></SelectTrigger>
                        <SelectContent className="max-h-72">
                          {(isEntrada ? categoryOptionsReceita : categoryOptionsDespesa).map(({ cat, depth }) => (
                            <SelectItem key={cat.id} value={cat.id}>
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
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="p-2 text-center">
                      {r.status === "pending" && <Badge variant="outline">Pendente</Badge>}
                      {r.status === "confirmed" && <Badge className="bg-success/15 text-success border-success/30">Confirmado</Badge>}
                      {r.status === "ignored" && <Badge variant="secondary">Ignorado</Badge>}
                      {r.status === "duplicate" && (
                        <Badge className="bg-warning/15 text-warning border-warning/30">
                          <AlertTriangle className="h-3 w-3 mr-1" />Duplicado
                        </Badge>
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
