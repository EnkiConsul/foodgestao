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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { ArrowLeft, Check, RefreshCw, Search, X, AlertTriangle, Loader2, UserPlus, Pencil, FileJson, FileText, Split } from "lucide-react";
import { DividirLancamentoDialog } from "@/components/conciliacao/DividirLancamentoDialog";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import { CATEGORY_INDENT_STEP, categoryGuideLevels } from "@/lib/categories/display";
import { CategoryTypeBadge } from "@/components/categorias/CategoryTypeBadge";
import { buildCategoryTree, type Category } from "@/lib/categories/tree";
import { StagingCard } from "@/components/conciliacao/StagingCard";
import { DescriptionEditor } from "@/components/conciliacao/DescriptionEditor";
import { PluggyAuditDialog } from "@/components/conciliacao/PluggyAuditDialog";


import { ContactSelectContent } from "@/components/conciliacao/ContactSelectContent";
import { ContactFormDialog } from "@/components/contacts/ContactFormDialog";
import { suggestPaymentMethodId, normalizeText } from "@/lib/conciliacao/paymentMethodInference";
import { fetchAllCompanyContacts, findExistingContact, ensureContactCompanyLink } from "@/lib/conciliacao/contacts";
import {
  counterpartyLabel,
  extractCounterparty,
  matchBankByConnector,
  onlyDigits,
  type BankOpt,
  type Counterparty,
} from "@/lib/conciliacao/counterparty";
import { toProperName } from "@/lib/text/properName";
import { normalizeDocumento } from "@/lib/documento";



interface ConciliacaoDraft {
  selected: string[];
  rowAccount: Record<string, string>;
  rowCategory: Record<string, string>;
  rowKind: Record<string, "auto" | "transfer">;
  rowCounterpart: Record<string, string>;
  rowPayment: Record<string, string>;
  rowContact: Record<string, string>;
}

const EMPTY_DRAFT: ConciliacaoDraft = {
  selected: [],
  rowAccount: {},
  rowCategory: {},
  rowKind: {},
  rowCounterpart: {},
  rowPayment: {},
  rowContact: {},
};

function readDraft(key: string): ConciliacaoDraft {
  try {
    const raw = localStorage.getItem(key) ?? sessionStorage.getItem(key);
    if (!raw) return EMPTY_DRAFT;
    const parsed = JSON.parse(raw) as Partial<ConciliacaoDraft>;
    return {
      selected: Array.isArray(parsed.selected) ? parsed.selected : [],
      rowAccount: parsed.rowAccount ?? {},
      rowCategory: parsed.rowCategory ?? {},
      rowKind: parsed.rowKind ?? {},
      rowCounterpart: parsed.rowCounterpart ?? {},
      rowPayment: parsed.rowPayment ?? {},
      rowContact: parsed.rowContact ?? {},
    };
  } catch {
    return EMPTY_DRAFT;
  }
}

function writeDraft(key: string, draft: ConciliacaoDraft) {
  try {
    const empty =
      draft.selected.length === 0 &&
      Object.keys(draft.rowAccount).length === 0 &&
      Object.keys(draft.rowCategory).length === 0 &&
      Object.keys(draft.rowKind).length === 0 &&
      Object.keys(draft.rowCounterpart).length === 0 &&
      Object.keys(draft.rowPayment).length === 0 &&
      Object.keys(draft.rowContact).length === 0;
    sessionStorage.removeItem(key);
    if (empty) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(draft));
  } catch {
    /* ignore */
  }
}





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
  raw?: unknown;
  counterparty_name?: string | null;
  counterparty_document?: string | null;
  counterparty_document_type?: string | null;
}

interface Connection {
  id: string;
  connector_name: string | null;
  connector_image_url: string | null;
  status: string;
  last_synced_at: string | null;
}

interface AccountOpt { id: string; name: string; }
interface ContactOpt { id: string; name: string; type: string | null; document: string | null; }
interface CategoryOpt {
  id: string;
  name: string;
  transaction_type: string;
  parent_id: string | null;
  sort_order: number | null;
  color: string | null;
  is_active?: boolean | null;
  allow_transactions?: boolean | null;
  requires_review?: boolean | null;
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
  const hasChildren = new Set(options.map(({ cat }) => cat.parent_id).filter(Boolean) as string[]);
  return options.map(({ cat, depth }) => (
    <SelectItem
      key={cat.id}
      value={cat.id}
      disabled={
        cat.is_active === false ||
        cat.allow_transactions === false ||
        hasChildren.has(cat.id)
      }
    >
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
        {(cat.allow_transactions === false || hasChildren.has(cat.id)) && (
          <Badge variant="outline" className="ml-1 h-4 px-1.5 text-[10px] shrink-0">Grupo</Badge>
        )}
        {cat.requires_review && (
          <Badge variant="secondary" className="ml-1 h-4 px-1.5 text-[10px] shrink-0">Revisar</Badge>
        )}
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
  const focusedStagingId = searchParams.get("item");

  const [connections, setConnections] = useState<Connection[]>([]);
  const [connectionId, setConnectionId] = useState<string>("all");
  const [rows, setRows] = useState<StagingRow[]>([]);
  const [accounts, setAccounts] = useState<AccountOpt[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<AccountOpt[]>([]);
  const [contacts, setContacts] = useState<ContactOpt[]>([]);
  const [banks, setBanks] = useState<BankOpt[]>([]);
  const [companyCnpj, setCompanyCnpj] = useState<string | null>(null);
  /** CPF/CNPJ do titular das contas conectadas — nunca são contraparte. */
  const [ownDocuments, setOwnDocuments] = useState<string[]>([]);

  const [creatingContact, setCreatingContact] = useState<string | null>(null);
  /**
   * Cadastro de fornecedor/cliente pelo formulário oficial de Clientes / Fornecedores.
   * `rowId` guarda a linha que originou o cadastro para vincular o contato ao salvar.
   */
  const [contactForm, setContactForm] = useState<
    {
      rowId: string | null;
      name: string;
      document: string | null;
      type: "cliente" | "fornecedor" | "ambos";
    } | null
  >(null);
  /**
   * Edição do fornecedor/cliente já vinculado a uma linha: guardamos o registro
   * completo do contato + a linha de origem para manter o vínculo após salvar.
   */
  const [contactEdit, setContactEdit] = useState<
    { rowId: string; contact: any } | null
  >(null);
  const [loadingContactEdit, setLoadingContactEdit] = useState<string | null>(null);
  const [categories, setCategories] = useState<CategoryOpt[]>([]);
  const categoryOptionsReceita = useMemo(() => buildCategoryOptions(categories, "entrada"), [categories]);
  const categoryOptionsDespesa = useMemo(() => buildCategoryOptions(categories, "saida"), [categories]);
  // Os itens do seletor são pesados: renderizamos uma única vez e reutilizamos em todas as linhas.
  const categoryItemsReceita = useMemo(() => renderCategoryItems(categoryOptionsReceita), [categoryOptionsReceita]);
  const categoryItemsDespesa = useMemo(() => renderCategoryItems(categoryOptionsDespesa), [categoryOptionsDespesa]);
  const categoryTypeById = useMemo(() => {
    const m: Record<string, string> = {};
    for (const c of categories) m[c.id] = c.transaction_type;
    return m;
  }, [categories]);

  const draftKey = `conciliacao-draft:${selectedCompanyId ?? "none"}:${scopedLocalAccountId ?? "all"}`;
  const draft = useMemo(() => readDraft(draftKey), [draftKey]);

  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);

  const [statusFilter, setStatusFilter] = useState<string>("pending");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(() => new Set(draft.selected));
  const [rowAccount, setRowAccount] = useState<Record<string, string>>(() => draft.rowAccount);
  const [rowCategory, setRowCategory] = useState<Record<string, string>>(() => draft.rowCategory);
  /** "auto" = entrada/saída; "transfer" = transferência entre contas */
  const [rowKind, setRowKind] = useState<Record<string, "auto" | "transfer">>(() => draft.rowKind);
  const [rowCounterpart, setRowCounterpart] = useState<Record<string, string>>(() => draft.rowCounterpart);
  const [rowPayment, setRowPayment] = useState<Record<string, string>>(() => draft.rowPayment);
  /** Formas de pagamento inferidas automaticamente do extrato (para o rótulo "sugerido") */
  const [suggestedPayment, setSuggestedPayment] = useState<Record<string, string>>({});
  const [rowContact, setRowContact] = useState<Record<string, string>>(() => draft.rowContact);
  const [transferTxIds, setTransferTxIds] = useState<Set<string>>(new Set());
  const [rowBusy, setRowBusy] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState<null | "confirm" | "ignore">(null);

  // Mantém as seleções e rascunhos de vínculo mesmo se a página recarregar
  useEffect(() => {
    writeDraft(draftKey, {
      selected: Array.from(selected),
      rowAccount,
      rowCategory,
      rowKind,
      rowCounterpart,
      rowPayment,
      rowContact,
    });
  }, [draftKey, selected, rowAccount, rowCategory, rowKind, rowCounterpart, rowPayment, rowContact]);



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

    const [
      { data: conns, error: connsError },
      { data: staging, error: stagingError },
      { data: accs, error: accsError },
      { data: cats, error: catsError },
      { data: pluggyAccts },
      { data: pms, error: pmsError },
      { data: cts, error: ctsError },
      { data: bks },
      { data: comp },
    ] = await Promise.all([
      supabase.from("pluggy_connections")
        .select("id, connector_name, connector_image_url, status, last_synced_at")
        .eq("company_id", selectedCompanyId).order("created_at", { ascending: false }),
      stagingQuery.order("date", { ascending: false }).limit(500),
      supabase.rpc("get_accessible_accounts", {
        _context: "pj", _company_id: selectedCompanyId, _include_inactive: false,
      }),
      supabase.from("categories")
        .select("id, name, transaction_type, parent_id, sort_order, color, is_active, allow_transactions, requires_review, category_companies!inner(company_id)")
        .or("context.is.null,context.eq.pj")
        .eq("category_companies.company_id", selectedCompanyId)

        .order("parent_id", { nullsFirst: true })
        .order("sort_order")
        .order("name"),
      supabase.from("pluggy_accounts")
        .select("pluggy_account_id, linked_account_id, raw")
        .eq("company_id", selectedCompanyId),

      supabase.rpc("get_accessible_payment_methods", {
        _context: "pj", _company_id: selectedCompanyId,
      }),
      fetchAllCompanyContacts(selectedCompanyId),
      supabase.from("banks").select("id, name, tax_id").eq("is_active", true),
      supabase.from("companies").select("cnpj").eq("id", selectedCompanyId).maybeSingle(),
    ]);

    // Erros de carregamento não podem passar em silêncio: sem isso, listas
    // como fornecedores/clientes ficam vazias sem nenhum aviso ao usuário.
    const loadErrors: string[] = [];
    if (connsError) loadErrors.push(`conexões: ${connsError.message}`);
    if (stagingError) loadErrors.push(`lançamentos: ${stagingError.message}`);
    if (accsError) loadErrors.push(`contas: ${accsError.message}`);
    if (catsError) loadErrors.push(`categorias: ${catsError.message}`);
    if (pmsError) loadErrors.push(`formas de pagamento: ${pmsError.message}`);
    if (ctsError) loadErrors.push(`fornecedores/clientes: ${ctsError.message}`);
    if (loadErrors.length > 0) {
      toast.error("Falha ao carregar dados da conciliação", {
        description: loadErrors.join(" • "),
      });
    }

    setConnections((conns ?? []) as Connection[]);
    setRows((staging ?? []) as StagingRow[]);
    setAccounts(((accs ?? []) as any[]).map((a) => ({ id: a.id, name: a.name })));
    setPaymentMethods(((pms ?? []) as any[]).map((p) => ({ id: p.id, name: p.name })));
    setContacts((cts ?? []) as ContactOpt[]);
    setBanks(((bks ?? []) as any[]).map((b) => ({ id: b.id, name: b.name, tax_id: b.tax_id ?? null })));
    setCompanyCnpj(((comp ?? null) as { cnpj?: string | null } | null)?.cnpj ?? null);
    setCategories((cats ?? []) as CategoryOpt[]);


    // Mapa: conta Pluggy -> conta bancária local vinculada. Também coletamos os
    // documentos do titular das contas conectadas: sem eles, o próprio CPF do
    // usuário era tratado como contraparte de toda compra no débito.
    const linkedMap: Record<string, string> = {};
    const ownDocs: string[] = [];
    for (const pa of (pluggyAccts ?? []) as {
      pluggy_account_id: string;
      linked_account_id: string | null;
      raw?: unknown;
    }[]) {
      if (pa.linked_account_id) linkedMap[pa.pluggy_account_id] = pa.linked_account_id;
      const raw = (pa.raw ?? null) as
        | { taxNumber?: string | null; owner?: { taxNumber?: string | null } | null }
        | null;
      for (const doc of [raw?.taxNumber, raw?.owner?.taxNumber]) {
        if (doc) ownDocs.push(String(doc));
      }
    }
    setLinkedByPluggyAccount(linkedMap);
    setOwnDocuments(ownDocs);


    // preload suggested selections
    const acctMap: Record<string, string> = {};
    const catMap: Record<string, string> = {};
    const payMap: Record<string, string> = {};
    const pmOpts = ((pms ?? []) as { id: string; name: string }[]).map((p) => ({ id: p.id, name: p.name }));
    for (const r of (staging ?? []) as StagingRow[]) {
      const fallback = linkedMap[r.pluggy_account_id];
      const target = r.suggested_account_id ?? fallback;
      if (target) acctMap[r.id] = target;
      if (r.suggested_category_id) catMap[r.id] = r.suggested_category_id;
      const suggestedPm = suggestPaymentMethodId(r, pmOpts);
      if (suggestedPm) payMap[r.id] = suggestedPm;
    }
    setRowAccount((prev) => ({ ...acctMap, ...prev }));
    setRowCategory((prev) => ({ ...catMap, ...prev }));
    setRowPayment((prev) => ({ ...payMap, ...prev }));
    setSuggestedPayment(payMap);

    // Descarta seleções salvas que já não são mais pendentes
    const stillPending = new Set(
      ((staging ?? []) as StagingRow[]).filter((r) => r.status === "pending").map((r) => r.id),
    );
    setSelected((prev) => new Set(Array.from(prev).filter((id) => stillPending.has(id))));



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
      if (focusedStagingId && r.id !== focusedStagingId) return false;
      if (connectionId !== "all" && r.connection_id !== connectionId) return false;
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (search && !(r.description ?? "").toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [rows, connectionId, statusFilter, search, focusedStagingId]);

  /** Lista longa: renderizamos em blocos para não pagar o custo de centenas de linhas por render. */
  const PAGE_SIZE = 50;
  const [visibleLimit, setVisibleLimit] = useState(PAGE_SIZE);
  useEffect(() => {
    setVisibleLimit(PAGE_SIZE);
  }, [connectionId, statusFilter, search, focusedStagingId]);
  const visibleRows = useMemo(() => filtered.slice(0, visibleLimit), [filtered, visibleLimit]);


  useEffect(() => {
    if (!focusedStagingId || loading) return;
    document.querySelector(`[data-staging-id="${focusedStagingId}"]`)?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  }, [focusedStagingId, loading, filtered.length]);

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

      // Lançamentos comuns: uma chamada por (conta, categoria, forma de pagamento, contato)
      const byGroup: Record<string, string[]> = {};
      for (const sid of normalIds) {
        const key = [
          rowCategory[sid] ?? "__none__",
          rowPayment[sid] ?? "__none__",
          rowContact[sid] ?? "__none__",
        ].join("|");
        byGroup[key] = byGroup[key] ?? [];
        byGroup[key].push(sid);
      }
      for (const [key, sids] of Object.entries(byGroup)) {
        const [cat, pm, ct] = key.split("|");
        const { data, error } = await supabase.rpc("pluggy_confirm_staging", {
          p_staging_ids: sids,
          p_account_id: acctId,
          p_category_id: cat === "__none__" ? null : cat,
          p_payment_method_id: pm === "__none__" ? null : pm,
          p_contact_id: ct === "__none__" ? null : ct,
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
    try {
      await confirmIds(Array.from(selected));
      // Fim do fluxo: oferece o extrato comparativo banco x plataforma
      toast.success("Conciliação concluída", {
        description: "Veja o extrato comparativo entre o banco e a plataforma.",
        action: {
          label: "Ver extrato",
          onClick: () =>
            navigate(
              `/contas-bancarias/conciliacao/extrato${scopedLocalAccountId ? `?account=${scopedLocalAccountId}` : ""}`,
            ),
        },
      });
    } finally { setBulkBusy(null); }
  };
  const ignoreSelected = async () => {
    setBulkBusy("ignore");
    try { await ignoreIds(Array.from(selected)); } finally { setBulkBusy(null); }
  };


  /** Salva a descrição editada do lançamento importado (antes de conciliar). */
  const saveDescription = async (id: string, description: string) => {
    const { error } = await supabase
      .from("pluggy_staging_transactions")
      .update({ description })
      .eq("id", id);
    if (error) {
      toast.error("Não foi possível alterar a descrição", { description: error.message });
      return false;
    }
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, description } : r)));
    toast.success("Descrição atualizada");
    return true;
  };

  /** Divisão de uma linha do banco em vários lançamentos. */
  const [splitRowId, setSplitRowId] = useState<string | null>(null);
  const splitRow = useMemo(() => rows.find((r) => r.id === splitRowId) ?? null, [rows, splitRowId]);
  const splitAccountId = splitRow
    ? (rowAccount[splitRow.id] ?? linkedByPluggyAccount[splitRow.pluggy_account_id] ?? null)
    : null;
  const openSplit = (id: string) => setSplitRowId(id);

  const handleRowAction = async (id: string, action: "confirm" | "ignore" | "split") => {
    if (action === "split") { openSplit(id); return; }
    setRowBusy(id);
    try {
      if (action === "confirm") await confirmIds([id]);
      else await ignoreIds([id]);
    } finally {
      setRowBusy(null);
    }
  };



  /** Banco cadastrado de cada conexão Open Finance (para débitos internos). */
  const bankByConnection = useMemo(() => {
    const m: Record<string, BankOpt | null> = {};
    for (const c of connections) m[c.id] = matchBankByConnector(c.connector_name, banks);
    return m;
  }, [connections, banks]);

  /**
   * Contraparte de cada lançamento: nome + CNPJ/CPF do extrato. Em débitos
   * internos (tarifas, IOF, juros, rendimentos) a contraparte é o próprio banco.
   */
  /** Documentos que pertencem ao próprio usuário/empresa (nunca contraparte). */
  const ownDocumentSet = useMemo(() => {
    const s = new Set<string>();
    for (const d of [companyCnpj, ...ownDocuments]) {
      const digits = normalizeDocumento(d);
      if (digits.length >= 11) s.add(digits);
    }
    return s;
  }, [companyCnpj, ownDocuments]);

  const counterpartyByRow = useMemo(() => {
    const m: Record<string, Counterparty> = {};
    for (const r of rows) {
      const base = extractCounterparty(r, { ownDocuments: [...ownDocumentSet] });
      if (base.internal) {
        const bank = bankByConnection[r.connection_id] ?? null;
        m[r.id] = {
          name: bank?.name ?? connections.find((c) => c.id === r.connection_id)?.connector_name ?? null,
          document: bank?.tax_id ?? null,
          documentType: bank?.tax_id ? "CNPJ" : null,
          internal: true,
        };
        continue;
      }
      // O dado gravado na importação também pode trazer o documento do titular.
      const stagedDoc = normalizeDocumento(r.counterparty_document);
      const stagedValid = stagedDoc.length >= 11 && !ownDocumentSet.has(stagedDoc);
      m[r.id] = {
        ...base,
        name: base.name ?? (stagedValid ? r.counterparty_name : null) ?? null,
        document: base.document ?? (stagedValid ? r.counterparty_document : null) ?? null,
        documentType:
          base.documentType ??
          ((stagedValid
            ? (r.counterparty_document_type as "CNPJ" | "CPF" | null | undefined)
            : null) ?? null),
      };
    }
    return m;
  }, [rows, ownDocumentSet, bankByConnection, connections]);

  /** Contato cadastrado por documento (chave normalizada de CPF/CNPJ). */
  const contactIdByDocument = useMemo(() => {
    const m: Record<string, string> = {};
    for (const c of contacts) {
      const d = normalizeDocumento(c.document);
      if (d.length >= 11 && !m[d]) m[d] = c.id;
    }
    return m;
  }, [contacts]);

  /** Contato cadastrado por nome normalizado (fallback sem documento). */
  const contactIdByName = useMemo(() => {
    const m: Record<string, string> = {};
    for (const c of contacts) {
      const n = normalizeText(c.name ?? "");
      if (n.length >= 3 && !m[n]) m[n] = c.id;
    }
    return m;
  }, [contacts]);

  const suggestedContact = useMemo(() => {
    const m: Record<string, string> = {};
    for (const r of rows) {
      const cp = counterpartyByRow[r.id];
      const doc = normalizeDocumento(cp?.document);
      const byDoc = doc && !ownDocumentSet.has(doc) ? contactIdByDocument[doc] : undefined;
      if (byDoc) { m[r.id] = byDoc; continue; }
      // Sem documento de terceiro: só sugerimos com nome idêntico ao cadastrado.
      const byName = cp?.name ? contactIdByName[normalizeText(cp.name)] : undefined;
      if (byName) m[r.id] = byName;
    }
    return m;
  }, [rows, counterpartyByRow, contactIdByDocument, contactIdByName, ownDocumentSet]);


  // Pré-seleciona o fornecedor/cliente identificado pelo documento do extrato,
  // sem sobrescrever escolhas manuais nem rascunhos salvos.
  useEffect(() => {
    if (Object.keys(suggestedContact).length === 0) return;
    setRowContact((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const [id, contactId] of Object.entries(suggestedContact)) {
        if (!next[id]) { next[id] = contactId; changed = true; }
      }
      return changed ? next : prev;
    });
  }, [suggestedContact]);

  /**
   * Cadastro do fornecedor/cliente da linha: se já existir contato com o mesmo
   * documento ou nome, vincula direto; caso contrário abre o formulário oficial
   * de Clientes / Fornecedores pré-preenchido com o que o extrato identificou.
   */
  const createContactFromStatement = async (row: StagingRow) => {
    const cp = counterpartyByRow[row.id];
    // Nomes vindos do extrato chegam em CAIXA ALTA: normalizamos antes de sugerir.
    const name = toProperName(cp?.name ?? "").trim();
    const document = cp?.document ?? null;
    const isEntrada = row.amount >= 0;
    const contactType: "cliente" | "fornecedor" =
      cp?.internal ? "fornecedor" : isEntrada ? "cliente" : "fornecedor";

    if (name || document) {
      setCreatingContact(row.id);
      try {
        const { data: auth } = await supabase.auth.getUser();
        const userId = auth.user?.id;
        if (!userId || !selectedCompanyId) { toast.error("Sessão expirada"); return; }

        // Reaproveita contato já existente (mesmo documento ou mesmo nome) em vez de duplicar.
        const existing = await findExistingContact({ userId, name, document });
        if (existing) {
          await ensureContactCompanyLink(existing.id, selectedCompanyId);
          setContacts((prev) =>
            prev.some((c) => c.id === existing.id)
              ? prev
              : [...prev, {
                  id: existing.id,
                  name: existing.name,
                  type: existing.contact_type ?? null,
                  document: existing.document ?? null,
                }].sort((a, b) => a.name.localeCompare(b.name)),
          );
          setRowContact((prev) => ({ ...prev, [row.id]: existing.id }));
          toast.success("Contato já cadastrado — vinculado ao lançamento");
          return;
        }
      } finally {
        setCreatingContact(null);
      }
    }

    setContactForm({ rowId: row.id, name, document, type: contactType });
  };

  // Empresa em contexto já vem marcada nos vínculos do novo contato.
  const contactFormCompanyIds = useMemo(
    () => (selectedCompanyId ? [selectedCompanyId] : []),
    [selectedCompanyId],
  );

  /** Após salvar no formulário: recarrega a lista e vincula o novo contato à linha. */
  const handleContactSaved = async (newId?: string) => {
    const rowId = contactForm?.rowId ?? null;
    setContactForm(null);
    if (!selectedCompanyId) return;
    if (newId) await ensureContactCompanyLink(newId, selectedCompanyId);
    const cts = await fetchAllCompanyContacts(selectedCompanyId);
    setContacts((cts ?? []) as ContactOpt[]);
    if (newId && rowId) setRowContact((prev) => ({ ...prev, [rowId]: newId }));
  };

  /** Abre o formulário oficial em modo edição para o contato já vinculado à linha. */
  const openEditContact = async (rowId: string) => {
    const contactId = rowContact[rowId];
    if (!contactId) return;
    setLoadingContactEdit(rowId);
    try {
      const { data, error } = await supabase
        .from("contacts")
        .select("*")
        .eq("id", contactId)
        .maybeSingle();
      if (error || !data) {
        toast.error("Não foi possível abrir o cadastro", { description: error?.message });
        return;
      }
      setContactEdit({ rowId, contact: data });
    } finally {
      setLoadingContactEdit(null);
    }
  };

  /** Após editar: recarrega a lista de contatos e mantém o vínculo da linha. */
  const handleContactEdited = async () => {
    const keep = contactEdit;
    setContactEdit(null);
    if (!selectedCompanyId) return;
    const cts = await fetchAllCompanyContacts(selectedCompanyId);
    setContacts((cts ?? []) as ContactOpt[]);
    if (keep) setRowContact((prev) => ({ ...prev, [keep.rowId]: keep.contact.id }));
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
                ? "Lançamentos importados apenas desta conta financeira."
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
        <Button
          onClick={() => setAuditOpen(true)}
          variant="outline"
          className="w-full sm:w-auto"
        >
          <FileJson className="h-4 w-4 mr-2" />
          Auditoria
        </Button>
        <Button
          onClick={() => navigate(`/contas-bancarias/conciliacao/extrato${scopedLocalAccountId ? `?account=${scopedLocalAccountId}` : ""}`)}
          variant="outline"
          className="w-full sm:w-auto"
        >
          <FileText className="h-4 w-4 mr-2" />
          Extrato de Conciliação
        </Button>

      </div>




      {scopeUnresolved && (
        <Card className="border-warning/50 bg-warning/10">
          <CardContent className="p-3 text-sm text-foreground flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-warning shrink-0" />
            Esta conta não possui vínculo com uma conexão Open Finance. Exibindo a fila completa da empresa.
          </CardContent>
        </Card>
      )}

      <div className="sticky top-14 z-20 -mx-3 space-y-2 border-b bg-background/95 px-3 py-2 backdrop-blur md:-mx-6 md:px-6 md:py-3 lg:top-16">
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          {!scope && (
            <Select value={connectionId} onValueChange={setConnectionId}>
              <SelectTrigger className="h-10 w-full max-w-full sm:h-9 sm:w-[220px] [&>span]:block [&>span]:truncate [&>span]:text-left"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as conexões</SelectItem>
                {connections.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.connector_name ?? "Banco"}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <div className="relative w-full sm:flex-1 sm:min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar descrição..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-10 pl-10 sm:h-9"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                aria-label="Limpar busca"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* Filtros de status como chips com contagem (todos os tamanhos de tela) */}
        <div
          role="tablist"
          aria-label="Filtrar por status"
          className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-0.5 sm:flex-wrap sm:overflow-visible [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >

          {([
            { value: "pending", label: "Pendentes", count: counts.pending },
            { value: "confirmed", label: "Confirmados", count: counts.confirmed },
            { value: "ignored", label: "Ignorados", count: counts.ignored },
            { value: "all", label: "Todos", count: counts.pending + counts.confirmed + counts.ignored },
          ] as const).map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setStatusFilter(f.value)}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-medium transition-colors",
                statusFilter === f.value
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground",
              )}
            >
              {f.label}
              <span
                className={cn(
                  "rounded-full px-1.5 text-[10px] tabular-nums",
                  statusFilter === f.value ? "bg-primary-foreground/20" : "bg-muted",
                )}
              >
                {f.count}
              </span>
            </button>
          ))}
        </div>
      </div>


      {pendingFiltered.length > 0 && (
        <div className="hidden flex-col gap-2 rounded-md border border-primary/40 bg-primary/5 p-2 sm:flex sm:flex-row sm:flex-wrap sm:items-center">
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
              <SelectTrigger className="h-8 w-full max-w-full text-xs sm:w-[240px] [&>span]:block [&>span]:truncate [&>span]:text-left">
                <SelectValue placeholder="Marcar como transferência p/…" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <div className="grid grid-cols-2 gap-2 sm:ml-auto sm:flex">
            <Button size="sm" variant="outline" onClick={ignoreSelected} disabled={selected.size === 0 || bulkBusy !== null}>
              {bulkBusy === "ignore"
                ? <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                : <X className="h-4 w-4 mr-1" />} Ignorar
            </Button>
            <Button size="sm" onClick={confirmSelected} disabled={selected.size === 0 || bulkBusy !== null}>
              {bulkBusy === "confirm"
                ? <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                : <Check className="h-4 w-4 mr-1" />}
              <span className="sm:hidden">Confirmar</span>
              <span className="hidden sm:inline">Confirmar selecionados</span>
            </Button>

          </div>

        </div>
      )}

      {/* Mobile: resumo da fila + seleção rápida */}
      {pendingFiltered.length > 0 && (
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground sm:hidden">
          <span role="status" aria-live="polite">
            {selected.size > 0
              ? `${selected.size} de ${pendingFiltered.length} selecionado(s)`
              : `${pendingFiltered.length} pendente(s)`}
          </span>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 px-2 text-xs"
            onClick={() =>
              allPendingSelected
                ? setSelected(new Set())
                : setSelected(new Set(pendingFiltered.map((r) => r.id)))
            }
          >
            {allPendingSelected ? "Limpar seleção" : "Selecionar todos"}
          </Button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="p-10 text-center text-sm text-muted-foreground">
          Nenhum lançamento encontrado com os filtros atuais.
        </CardContent></Card>
      ) : (
        <>
        {/* Mobile e tablet: um card por lançamento */}
        <div className="space-y-2 lg:hidden">


          {visibleRows.map((r) => {
            const isEntrada = r.amount >= 0;
            return (
              <div key={r.id} data-staging-id={r.id}>
              <StagingCard
                row={r}
                accounts={accounts}
                accountValue={rowAccount[r.id] ?? linkedByPluggyAccount[r.pluggy_account_id] ?? ""}
                onAccountChange={(v) => setRowAccount((p) => ({ ...p, [r.id]: v }))}
                kind={rowKind[r.id] ?? "auto"}
                onKindChange={(v) => setRowKind((p) => ({ ...p, [r.id]: v }))}
                counterpart={rowCounterpart[r.id] ?? ""}
                onCounterpartChange={(v) => setRowCounterpart((p) => ({ ...p, [r.id]: v }))}
                category={rowCategory[r.id] ?? ""}
                onCategoryChange={(v) => setRowCategory((p) => ({ ...p, [r.id]: v }))}
                suggestedCategoryItems={isEntrada ? categoryItemsReceita : categoryItemsDespesa}
                oppositeCategoryItems={isEntrada ? categoryItemsDespesa : categoryItemsReceita}
                paymentMethods={paymentMethods}
                paymentMethod={rowPayment[r.id] ?? ""}
                paymentMethodSuggested={!!rowPayment[r.id] && rowPayment[r.id] === suggestedPayment[r.id]}
                onPaymentMethodChange={(v) => setRowPayment((p) => ({ ...p, [r.id]: v }))}
                contacts={contacts}
                contact={rowContact[r.id] ?? ""}
                contactSuggested={!!rowContact[r.id] && rowContact[r.id] === suggestedContact[r.id]}
                onContactChange={(v) => setRowContact((p) => ({ ...p, [r.id]: v }))}
                counterpartyLabel={counterpartyLabel(counterpartyByRow[r.id] ?? { name: null, document: null, documentType: null, internal: false })}
                counterpartyInternal={!!counterpartyByRow[r.id]?.internal}
                canCreateContact={
                  !rowContact[r.id] &&
                  !!(counterpartyByRow[r.id]?.name || counterpartyByRow[r.id]?.document)
                }
                creatingContact={creatingContact === r.id}
                onCreateContact={() => createContactFromStatement(r)}
                onCreateNewContact={() =>
                  setContactForm({
                    rowId: r.id,
                    name: "",
                    document: null,
                    type: isEntrada ? "cliente" : "fornecedor",
                  })
                }
                onEditContact={() => void openEditContact(r.id)}
                isReversal={
                  !!rowCategory[r.id] &&
                  categoryTypeById[rowCategory[r.id]] === (isEntrada ? "saida" : "entrada")
                }

                selected={selected.has(r.id)}
                onSelectedChange={(v) => {
                  setSelected((prev) => {
                    const next = new Set(prev);
                    if (v) next.add(r.id); else next.delete(r.id);
                    return next;
                  });
                }}
                busy={rowBusy === r.id}
                isTransferBadge={!!r.matched_transaction_id && transferTxIds.has(r.matched_transaction_id)}
                maskBRL={maskBRL}
                onDescriptionSave={(v) => saveDescription(r.id, v)}
                onAction={(action) => handleRowAction(r.id, action)}

              />
              </div>
            );
          })}
        </div>

        {/* Desktop (lg+): tabela completa */}
        <Card className="hidden lg:block"><CardContent className="p-0 overflow-x-auto">

          <table className="w-full table-fixed text-sm">
            {/* Grade proporcional: soma 100% da largura visível — sem rolagem lateral */}
            <colgroup>
              <col style={{ width: "3%" }} />
              <col style={{ width: "7%" }} />
              <col style={{ width: "20%" }} />
              <col style={{ width: "8%" }} />
              <col style={{ width: "11%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "13%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "11%" }} />
              <col style={{ width: "7%" }} />
              <col style={{ width: "7%" }} />
            </colgroup>
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="p-2">
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
                <th className="p-2 text-left" title="Categoria / contraparte">Categoria</th>
                <th className="p-2 text-left" title="Forma de pagamento">Forma pgto.</th>
                <th className="p-2 text-left" title="Fornecedor / cliente">Fornec./Cliente</th>
                <th className="p-2 text-center">Status</th>
                <th className="p-2 text-right">Ações</th>
              </tr>

            </thead>
            <tbody>
              {visibleRows.map((r) => {
                const isEntrada = r.amount >= 0;
                const disabled = r.status !== "pending";
                return (
                  <tr key={r.id} data-staging-id={r.id} className="border-t hover:bg-muted/30">
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
                    <td className="p-2 whitespace-nowrap" title={format(parseISO(r.date), "dd/MM/yyyy")}>{format(parseISO(r.date), "dd/MM/yy")}</td>
                    <td className="p-2">
                      <DescriptionEditor
                        compact
                        value={r.description}
                        disabled={disabled}
                        onSave={(v) => saveDescription(r.id, v)}
                      />

                      {counterpartyLabel(counterpartyByRow[r.id] ?? { name: null, document: null, documentType: null, internal: false }) && (
                        <p className="mt-0.5 truncate text-[10px] text-muted-foreground" title={counterpartyLabel(counterpartyByRow[r.id]!) ?? ""}>
                          {counterpartyByRow[r.id]?.internal ? "Banco (débito interno): " : ""}
                          {counterpartyLabel(counterpartyByRow[r.id]!)}
                        </p>
                      )}
                    </td>
                    <td className={`p-2 text-right font-medium whitespace-nowrap ${isEntrada ? "text-success" : "text-destructive"}`}>
                      {maskBRL(r.amount)}
                    </td>
                    <td className="p-2">
                      <Select
                        value={rowAccount[r.id] ?? linkedByPluggyAccount[r.pluggy_account_id] ?? ""}
                        onValueChange={(v) => setRowAccount((p) => ({ ...p, [r.id]: v }))}
                        disabled={disabled}
                      >
                        <SelectTrigger className="h-8 w-full max-w-full text-xs [&>span]:block [&>span]:truncate [&>span]:text-left"><SelectValue placeholder="Selecionar…" /></SelectTrigger>
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
                        <SelectTrigger className="h-8 w-full max-w-full text-xs [&>span]:block [&>span]:truncate [&>span]:text-left" aria-label="Tipo do lançamento">
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
                            <SelectTrigger className="h-8 w-full max-w-full text-xs [&>span]:block [&>span]:truncate [&>span]:text-left">
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
                            <SelectTrigger className="h-8 w-full max-w-full text-xs [&>span]:block [&>span]:truncate [&>span]:text-left"><SelectValue placeholder="Sem categoria" /></SelectTrigger>
                            <SelectContent className="max-h-[420px]">
                              <SelectGroup>
                                <SelectLabel className="sticky top-0 z-10 bg-popover border-b text-[10px] uppercase tracking-wide text-muted-foreground">
                                  Sugeridas ({isEntrada ? "entradas" : "saídas"})
                                </SelectLabel>
                                {isEntrada ? categoryItemsReceita : categoryItemsDespesa}
                              </SelectGroup>
                              <SelectGroup>
                                <SelectLabel className="sticky top-0 z-10 bg-popover border-y text-[10px] uppercase tracking-wide text-warning">
                                  Outras categorias — {isEntrada ? "saídas" : "entradas"} (estorno)
                                </SelectLabel>
                                {isEntrada ? categoryItemsDespesa : categoryItemsReceita}
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

                    <td className="p-2">
                      {(rowKind[r.id] ?? "auto") === "transfer" ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : (
                        <>
                        <Select
                          value={rowPayment[r.id] ?? ""}
                          onValueChange={(v) => setRowPayment((p) => ({ ...p, [r.id]: v }))}
                          disabled={disabled}
                        >
                          <SelectTrigger className="h-8 w-full max-w-full text-xs [&>span]:block [&>span]:truncate [&>span]:text-left">
                            <SelectValue placeholder="Não informada" />
                          </SelectTrigger>
                          <SelectContent>
                            {paymentMethods.map((p) => (
                              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                          {rowPayment[r.id] && rowPayment[r.id] === suggestedPayment[r.id] && (
                            <p className="mt-1 text-[10px] text-muted-foreground">sugerido pelo extrato</p>
                          )}
                        </>
                      )}
                    </td>

                    <td className="p-2">
                      {(rowKind[r.id] ?? "auto") === "transfer" ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : (
                        <>
                        <Select
                          value={rowContact[r.id] ?? ""}
                          onValueChange={(v) => setRowContact((p) => ({ ...p, [r.id]: v }))}
                          disabled={disabled}
                        >
                          <SelectTrigger className="h-8 w-full max-w-full text-xs [&>span]:block [&>span]:truncate [&>span]:text-left">
                            <SelectValue placeholder={isEntrada ? "Cliente…" : "Fornecedor…"} />
                          </SelectTrigger>
                          <ContactSelectContent
                            contacts={contacts}
                            className="max-h-[420px]"
                            onCreateNew={
                              disabled
                                ? undefined
                                : () =>
                                    setContactForm({
                                      rowId: r.id,
                                      name: "",
                                      document: null,
                                      type: isEntrada ? "cliente" : "fornecedor",
                                    })
                            }
                          />
                        </Select>
                        {rowContact[r.id] && rowContact[r.id] === suggestedContact[r.id] && (
                          <p className="mt-1 text-[10px] text-muted-foreground">identificado pelo extrato</p>
                        )}
                        {!disabled && rowContact[r.id] && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="mt-1 h-7 w-full justify-start px-1 text-[10px]"
                            disabled={loadingContactEdit === r.id}
                            onClick={() => void openEditContact(r.id)}
                          >
                            {loadingContactEdit === r.id
                              ? <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                              : <Pencil className="mr-1 h-3 w-3" />}
                            <span className="truncate">Editar cadastro</span>
                          </Button>
                        )}
                        {!disabled && !rowContact[r.id] && (counterpartyByRow[r.id]?.name || counterpartyByRow[r.id]?.document) && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="mt-1 h-7 w-full justify-start px-1 text-[10px]"
                            disabled={creatingContact === r.id}
                            onClick={() => createContactFromStatement(r)}
                          >
                            {creatingContact === r.id
                              ? <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                              : <UserPlus className="mr-1 h-3 w-3" />}
                            <span className="truncate">Cadastrar {counterpartyByRow[r.id]?.name ?? "fornecedor/cliente"}</span>
                          </Button>
                        )}
                        </>
                      )}
                    </td>



                    <td className="p-2 text-center">
                      <div className="flex flex-wrap items-center justify-center gap-1">
                        {r.status === "pending" && <Badge variant="outline" className="text-[10px]">Pendente</Badge>}
                        {r.status === "confirmed" && <Badge className="bg-success/15 text-success border-success/30 text-[10px]">Confirmado</Badge>}
                        {r.status === "ignored" && <Badge variant="secondary" className="text-[10px]">Ignorado</Badge>}
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
                            variant="outline"
                            className="h-8 px-2"
                            disabled={rowBusy === r.id}
                            onClick={() => openSplit(r.id)}
                            aria-label="Dividir lançamento em vários"
                            title="Dividir em vários lançamentos"
                          >
                            <Split className="h-4 w-4" />
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
                              : <Check className="h-4 w-4" />}
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
        {filtered.length > visibleRows.length && (
          <div className="flex justify-center py-4">
            <Button variant="outline" onClick={() => setVisibleLimit((n) => n + PAGE_SIZE)}>
              Mostrar mais ({filtered.length - visibleRows.length} restantes)
            </Button>
          </div>
        )}
        </>
      )}

      {/* Mobile: barra de ações em lote flutuante */}
      {selected.size > 0 && (
        <div
          className="fixed inset-x-0 z-40 px-3 sm:hidden"
          style={{ bottom: "calc(4.5rem + env(safe-area-inset-bottom))" }}
        >
          <div className="flex items-center gap-2 rounded-xl border border-primary/40 bg-card p-2 shadow-lg">
            <span className="pl-1 text-xs font-medium">{selected.size} selec.</span>
            <Button
              variant="ghost"
              className="h-9 px-2 text-xs"
              onClick={() => setSelected(new Set())}
              aria-label="Limpar seleção"
            >
              Limpar
            </Button>
            <Button
              variant="outline"
              className="ml-auto h-9 px-3"
              onClick={ignoreSelected}
              disabled={bulkBusy !== null}
            >
              {bulkBusy === "ignore"
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <X className="h-4 w-4" />}
            </Button>
            <Button className="h-9 px-3 text-xs" onClick={confirmSelected} disabled={bulkBusy !== null}>
              {bulkBusy === "confirm"
                ? <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                : <Check className="mr-1 h-4 w-4" />}
              Confirmar
            </Button>
          </div>
        </div>
      )}

      <ContactFormDialog
        open={!!contactForm}
        onOpenChange={(o) => { if (!o) setContactForm(null); }}
        defaultName={contactForm?.name}
        defaultDocument={contactForm?.document ?? null}
        defaultContactType={contactForm?.type}
        defaultCompanyIds={contactFormCompanyIds}
        defaultVisiblePf={false}
        onSaved={(newId) => { void handleContactSaved(newId); }}
      />

      <ContactFormDialog
        open={!!contactEdit}
        onOpenChange={(o) => { if (!o) setContactEdit(null); }}
        editContact={contactEdit?.contact ?? null}
        onSaved={() => { void handleContactEdited(); }}
      />

      <DividirLancamentoDialog
        open={!!splitRowId}
        onOpenChange={(o) => { if (!o) setSplitRowId(null); }}
        row={splitRow ? { id: splitRow.id, date: splitRow.date, description: splitRow.description, amount: splitRow.amount } : null}
        accountId={splitAccountId}
        categoryOptions={(splitRow?.amount ?? 0) >= 0 ? categoryItemsReceita : categoryItemsDespesa}
        paymentMethods={paymentMethods}
        contacts={contacts}
        onDone={() => { setSplitRowId(null); load(); }}
      />

      <PluggyAuditDialog open={auditOpen} onOpenChange={setAuditOpen} />
    </div>

  );

}
