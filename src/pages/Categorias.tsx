import { useState, useMemo, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useRealtimeSync } from "@/hooks/useRealtimeSync";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { CategoryFormDialog } from "@/components/categories/CategoryFormDialog";
import { Plus, Search, Tag, ChevronsUpDown, Sparkles, MoreHorizontal, X } from "lucide-react";
import { DragDropContext, Droppable, type DropResult } from "@hello-pangea/dnd";
import { toast } from "sonner";
import { buildCategoryTree, type Category, type TreeNode } from "@/lib/categories/tree";
import { CategoryRow } from "@/components/categorias/CategoryRow";
import { CategoryMobileRow } from "@/components/categorias/CategoryMobileRow";
import { BatchActionBar } from "@/components/categorias/BatchActionBar";
import { BatchVisibilityDialog } from "@/components/categorias/BatchVisibilityDialog";



export default function Categorias() {
  const { user } = useAuth();
  const { contextType, selectedCompanyId } = useCompanyContext();

  // Sincronização em tempo real
  useRealtimeSync({
    tables: ["categories"],
    invalidateKeyPrefixes: ["categories-page", "category-companies"],
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editCat, setEditCat] = useState<Category | null>(null);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [defaultParentId, setDefaultParentId] = useState<string | null>(null);
  const [defaultType, setDefaultType] = useState<"entrada" | "saida" | undefined>(undefined);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [batchParentId, setBatchParentId] = useState<string>("__none__");
  const [batchSaving, setBatchSaving] = useState(false);
  const [batchDeleteOpen, setBatchDeleteOpen] = useState(false);
  const [batchDeleting, setBatchDeleting] = useState(false);
  const [batchVisibilityOpen, setBatchVisibilityOpen] = useState(false);
  const [batchVisiblePf, setBatchVisiblePf] = useState(true);
  const [batchSelectedCompanies, setBatchSelectedCompanies] = useState<Set<string>>(new Set());
  const [batchVisibilitySaving, setBatchVisibilitySaving] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "blocked">("all");
  const [pendingToggle, setPendingToggle] = useState<{ cat: TreeNode; active: boolean; childIds: string[] } | null>(null);

  const [replaceOpen, setReplaceOpen] = useState(false);
  const [replacing, setReplacing] = useState(false);

  const handleSeedDefaults = async () => {
    if (!selectedCompanyId) return;
    setSeeding(true);
    const { data, error } = await supabase.rpc("seed_default_categories", { _company_id: selectedCompanyId });
    setSeeding(false);
    if (error) {
      toast.error("Erro ao importar plano padrão", { description: error.message });
      return;
    }
    const created = (data as any)?.created ?? 0;
    const skipped = (data as any)?.skipped ?? 0;
    toast.success("Plano padrão 360°FOOD importado", {
      description: `${created} categoria(s) criada(s), ${skipped} já existia(m).`,
    });
    refetchAll();
  };

  const handleReplaceWithDefaults = async () => {
    if (!selectedCompanyId) return;
    setReplacing(true);
    const { data, error } = await (supabase as any).rpc("apply_default_categories", {
      _company_id: selectedCompanyId,
      _replace_existing: true,
    });
    setReplacing(false);
    setReplaceOpen(false);
    if (error) {
      toast.error("Erro ao aplicar o plano padrão", { description: error.message });
      return;
    }
    const deleted = (data as any)?.deleted ?? 0;
    const detached = (data as any)?.detached ?? 0;
    const created = (data as any)?.seed?.created ?? 0;
    toast.success("Plano padrão 360°FOOD aplicado", {
      description: `${deleted} categoria(s) removida(s), ${created} criada(s), ${detached} lançamento(s) sem categoria para reclassificar.`,
    });
    setSelected(new Set());
    refetchAll();
  };


  const handleBatchColor = async (color: string) => {
    if (selected.size === 0) return;
    const updates = Array.from(selected).map((id) =>
      supabase.from("categories").update({ color }).eq("id", id)
    );
    await Promise.all(updates);
    toast.success(`Cor atualizada para ${selected.size} categoria(s)`);
    refetchAll();
  };

  const handleBatchChangeParent = async () => {
    if (selected.size === 0) return;
    setBatchSaving(true);
    const newParentId = !batchParentId || batchParentId === "__none__" ? null : batchParentId;
    const updates = Array.from(selected).map((id) =>
      supabase.from("categories").update({ parent_id: newParentId }).eq("id", id)
    );
    const results = await Promise.all(updates);
    const errors = results.filter((r) => r.error);
    if (errors.length > 0) {
      toast.error(`Erro ao mover ${errors.length} categoria(s)`);
    } else {
      toast.success(`${selected.size} categoria(s) movida(s)`);
      setSelected(new Set());
      setBatchParentId("__none__");
      refetchAll();
    }
    setBatchSaving(false);
  };
  const handleBatchDelete = async () => {
    if (selected.size === 0) return;
    setBatchDeleting(true);
    const deletes = Array.from(selected).map((id) =>
      supabase.from("categories").delete().eq("id", id)
    );
    const results = await Promise.all(deletes);
    const errors = results.filter((r) => r.error);
    if (errors.length > 0) {
      toast.error(`Erro ao excluir ${errors.length} categoria(s)`);
    } else {
      toast.success(`${selected.size} categoria(s) excluída(s)`);
      setSelected(new Set());
      refetchAll();
    }
    setBatchDeleting(false);
    setBatchDeleteOpen(false);
  };

  const handleBatchVisibility = async () => {
    if (selected.size === 0) return;
    setBatchVisibilitySaving(true);
    const ids = Array.from(selected);
    
    // Update visible_pf for all selected
    const updates = ids.map((id) =>
      supabase.from("categories").update({ visible_pf: batchVisiblePf } as any).eq("id", id)
    );
    await Promise.all(updates);

    // Sync category_companies for all selected
    await Promise.all(ids.map((id) =>
      supabase.from("category_companies").delete().eq("category_id", id)
    ));
    if (batchSelectedCompanies.size > 0) {
      const rows = ids.flatMap((catId) =>
        Array.from(batchSelectedCompanies).map((companyId) => ({
          category_id: catId,
          company_id: companyId,
        }))
      );
      await supabase.from("category_companies").insert(rows);
    }

    toast.success(`Visibilidade atualizada para ${selected.size} categoria(s)`);
    setSelected(new Set());
    setBatchVisibilityOpen(false);
    setBatchVisibilitySaving(false);
    refetchAll();
  };

  const { data: categories = [], refetch, isLoading } = useQuery({
    queryKey: ["categories-page", user?.id, contextType, selectedCompanyId],
    enabled: !!user && (contextType === "pf" || !!selectedCompanyId),
    queryFn: async () => {
      if (contextType === "pj") {
        // Em PJ, mostrar todas as categorias vinculadas à empresa ativa (visíveis a qualquer membro).
        const { data } = await supabase
          .from("categories")
          .select("*, category_companies!inner(company_id)")
          .or("context.is.null,context.eq.pj")
          .eq("category_companies.company_id", selectedCompanyId!)
          .order("parent_id", { nullsFirst: true })
          .order("sort_order")
          .order("name");
        return (data ?? []) as Category[];
      }
      // Em PF, mostrar apenas categorias visíveis no perfil pessoal
      const { data } = await supabase
        .from("categories")
        .select("*")
        .eq("user_id", user!.id)
        .or("context.is.null,context.eq.pf")
        .eq("visible_pf", true)
        .order("parent_id", { nullsFirst: true })
        .order("sort_order")
        .order("name");
      return (data ?? []) as Category[];
    },
  });

  const { data: companies = [] } = useQuery({
    queryKey: ["companies-for-categories", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("companies")
        .select("id, name")
        .eq("user_id", user!.id)
        .eq("is_active", true)
        .order("name");
      return data ?? [];
    },
  });

  const { data: categoryCompanies = [], refetch: refetchCatCompanies } = useQuery({
    queryKey: ["category-companies", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("category_companies")
        .select("category_id, company_id");
      return data ?? [];
    },
  });

  const refetchAll = useCallback(() => {
    refetch();
    refetchCatCompanies();
  }, [refetch, refetchCatCompanies]);

  const applyActive = async (ids: string[], active: boolean) => {
    if (ids.length === 0) return;
    const results = await Promise.all(
      ids.map((id) => supabase.from("categories").update({ is_active: active } as any).eq("id", id))
    );
    const errors = results.filter((r) => r.error);
    if (errors.length > 0) {
      toast.error(`Erro ao atualizar ${errors.length} categoria(s)`, {
        description: errors[0].error?.message,
      });
    } else {
      toast.success(
        active
          ? `Lançamentos permitidos em ${ids.length} categoria(s)`
          : `Lançamentos bloqueados em ${ids.length} categoria(s)`
      );
    }
    refetchAll();
  };

  const descendantIdsOf = useCallback(
    (id: string) => {
      const out: string[] = [];
      const walk = (parentId: string) => {
        for (const c of categories) {
          if (c.parent_id === parentId) {
            out.push(c.id);
            walk(c.id);
          }
        }
      };
      walk(id);
      return out;
    },
    [categories]
  );

  const handleToggleActive = (cat: TreeNode, active: boolean) => {
    const childIds = descendantIdsOf(cat.id);
    if (childIds.length > 0) {
      setPendingToggle({ cat, active, childIds });
      return;
    }
    applyActive([cat.id], active);
  };

  const handleBatchActive = async (active: boolean) => {
    if (selected.size === 0) return;
    await applyActive(Array.from(selected), active);
    setSelected(new Set());
  };



  const companyMap = useMemo(() => {
    const map = new Map<string, string>();
    companies.forEach((c) => map.set(c.id, c.name));
    return map;
  }, [companies]);

  const catCompanyMap = useMemo(() => {
    const map = new Map<string, string[]>();
    categoryCompanies.forEach((cc) => {
      const list = map.get(cc.category_id) || [];
      list.push(cc.company_id);
      map.set(cc.category_id, list);
    });
    return map;
  }, [categoryCompanies]);

  const filtered = useMemo(() => {
    return categories.filter((c) => {
      const matchSearch = !search || c.name.toLowerCase().includes(search.toLowerCase());
      const matchType = filterType === "all" || c.transaction_type === filterType;
      const active = (c as any).is_active !== false;
      const matchStatus =
        filterStatus === "all" || (filterStatus === "active" ? active : !active);
      return matchSearch && matchType && matchStatus;
    });
  }, [categories, search, filterType, filterStatus]);

  const tree = useMemo(() => buildCategoryTree(filtered), [filtered]);


  // Filter out children of collapsed parents
  const visibleTree = useMemo(() => {
    const result: TreeNode[] = [];
    const hiddenParents = new Set<string>();
    for (const node of tree) {
      if (node.parent_id && (hiddenParents.has(node.parent_id) || collapsed.has(node.parent_id))) {
        hiddenParents.add(node.id);
        continue;
      }
      result.push(node);
    }
    return result;
  }, [tree, collapsed]);

  const toggleCollapse = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    const cat = categories.find((c) => c.id === deleteId);
    const { error } = await supabase.from("categories").delete().eq("id", deleteId);
    if (error) toast.error("Erro ao excluir", { description: error.message });
    else {
      await supabase.rpc("insert_audit_log", {
        _action: "category_deleted",
        _entity_type: "category",
        _entity_id: deleteId,
        _details: { target_name: cat?.name || "—" },
      });
      toast.success("Categoria excluída"); refetchAll();
    }
    setDeleteId(null);
  };

  const openEdit = (cat: Category) => {
    setEditCat(cat);
    setDialogOpen(true);
  };

  const openNew = () => {
    setEditCat(null);
    setDefaultParentId(null);
    setDefaultType(undefined);
    setDialogOpen(true);
  };

  const openAddChild = (parent: Category) => {
    setEditCat(null);
    setDefaultParentId(parent.id);
    setDefaultType(parent.transaction_type as "entrada" | "saida");
    setDialogOpen(true);
  };

  const onDragEnd = async (result: DropResult) => {
    if (!result.destination) return;
    const srcIdx = result.source.index;
    const destIdx = result.destination.index;
    if (srcIdx === destIdx) return;

    const draggedItem = visibleTree[srcIdx];
    const targetItem = visibleTree[destIdx];

    // Only allow reordering among siblings (same parent)
    if (draggedItem.parent_id !== targetItem.parent_id) {
      toast.info("Só é possível reordenar entre categorias do mesmo nível");
      return;
    }

    // Get all siblings with same parent, sorted by current sort_order
    const siblings = categories
      .filter((c) => c.parent_id === draggedItem.parent_id)
      .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));

    const oldIdx = siblings.findIndex((c) => c.id === draggedItem.id);
    let newIdx = siblings.findIndex((c) => c.id === targetItem.id);
    if (newIdx === -1) {
      newIdx = destIdx > srcIdx ? siblings.length - 1 : 0;
    }

    if (oldIdx === -1 || oldIdx === newIdx) return;

    // Reorder siblings
    const reordered = [...siblings];
    reordered.splice(oldIdx, 1);
    reordered.splice(newIdx, 0, draggedItem);

    // Update sort_order for all reordered siblings
    const updates = reordered.map((cat, i) =>
      supabase.from("categories").update({ sort_order: i }).eq("id", cat.id)
    );
    await Promise.all(updates);
    toast.success("Ordem atualizada");
    refetchAll();
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === tree.length) setSelected(new Set());
    else setSelected(new Set(tree.map((c) => c.id)));
  };

  const counts = useMemo(() => {
    let receitas = 0;
    let despesas = 0;
    for (const c of categories) {
      if (c.transaction_type === "entrada") receitas++;
      else if (c.transaction_type === "saida") despesas++;
    }
    const blocked = categories.filter((c) => (c as any).is_active === false).length;
    return { total: categories.length, receitas, despesas, blocked };
  }, [categories]);

  const hasFilters = !!search || filterType !== "all" || filterStatus !== "all";
  const clearFilters = () => {
    setSearch("");
    setFilterType("all");
    setFilterStatus("all");
  };
  const allCollapsed = (() => {
    const parents = tree.filter((c) => c.hasChildren).map((c) => c.id);
    return parents.length > 0 && collapsed.size >= parents.length;
  })();
  const toggleCollapseAll = () => {
    const parents = tree.filter((c) => c.hasChildren).map((c) => c.id);
    if (allCollapsed) setCollapsed(new Set());
    else setCollapsed(new Set(parents));
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Categorias</h1>
        <p className="text-sm text-muted-foreground">
          Organize seu plano de contas por grupos e subcategorias.
        </p>
        {counts.total > 0 && (
          <p className="text-xs text-muted-foreground">
            {counts.total} categoria(s) · {counts.receitas} de receita · {counts.despesas} de despesa
          </p>
        )}
      </div>

      {/* Toolbar */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={openNew} size="sm" className="gap-1.5">
            <Plus className="h-4 w-4" />
            Nova categoria
          </Button>

          {/* Ações secundárias: visíveis no desktop */}
          <div className="hidden md:flex items-center gap-2">
            {contextType === "pj" && selectedCompanyId && (
              <Button
                onClick={handleSeedDefaults}
                variant="outline"
                size="sm"
                className="gap-1.5"
                disabled={seeding}
                title="Importa as categorias do plano padrão 360°FOOD. Categorias já importadas não são duplicadas."
              >
                <Sparkles className="h-4 w-4" />
                {seeding ? "Importando..." : "Importar plano 360°FOOD"}
              </Button>
            )}
            <Button variant="outline" size="sm" className="gap-1.5" onClick={toggleCollapseAll}>
              <ChevronsUpDown className="h-4 w-4" />
              {allCollapsed ? "Expandir tudo" : "Recolher tudo"}
            </Button>
          </div>

          {/* Ações secundárias: menu no mobile */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" aria-label="Mais ações" className="h-9 w-9 md:hidden">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {contextType === "pj" && selectedCompanyId && (
                <DropdownMenuItem onClick={handleSeedDefaults} disabled={seeding}>
                  <Sparkles className="mr-2 h-4 w-4" />
                  {seeding ? "Importando..." : "Importar plano 360°FOOD"}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={toggleCollapseAll}>
                <ChevronsUpDown className="mr-2 h-4 w-4" />
                {allCollapsed ? "Expandir tudo" : "Recolher tudo"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Tabs value={filterStatus} onValueChange={(v) => setFilterStatus(v as "all" | "active" | "blocked")} className="max-w-full">
            <TabsList className="h-8 overflow-x-auto flex w-auto">
              <TabsTrigger value="all" className="text-xs px-2.5 h-7">Status: todas</TabsTrigger>
              <TabsTrigger value="active" className="text-xs px-2.5 h-7">Permitem lançamentos</TabsTrigger>
              <TabsTrigger value="blocked" className="text-xs px-2.5 h-7">Bloqueadas ({counts.blocked})</TabsTrigger>
            </TabsList>
          </Tabs>

          <Tabs value={filterType} onValueChange={setFilterType} className="max-w-full">
            <TabsList className="h-8 overflow-x-auto flex w-auto">
              <TabsTrigger value="all" className="text-xs px-2.5 h-7">Todas ({counts.total})</TabsTrigger>
              <TabsTrigger value="saida" className="text-xs px-2.5 h-7">Despesas ({counts.despesas})</TabsTrigger>
              <TabsTrigger value="entrada" className="text-xs px-2.5 h-7">Receitas ({counts.receitas})</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="relative w-full md:max-w-[280px] md:ml-auto">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Buscar categoria..."
            aria-label="Buscar categoria"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 pr-8 h-9 text-sm md:h-8 md:text-xs"
            maxLength={50}
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              aria-label="Limpar busca"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>

          )}
        </div>
      </div>

      {/* Batch action bar */}
      {selected.size > 0 && (
        <BatchActionBar
          selectedCount={selected.size}
          categories={categories}
          selected={selected}
          batchParentId={batchParentId}
          batchSaving={batchSaving}
          onBatchParentChange={setBatchParentId}
          onBatchChangeParent={handleBatchChangeParent}
          onBatchColor={handleBatchColor}
          onOpenVisibility={() => {
            setBatchVisiblePf(true);
            setBatchSelectedCompanies(new Set(companies.map((c) => c.id)));
            setBatchVisibilityOpen(true);
          }}
          onBatchActive={handleBatchActive}
          onOpenDelete={() => setBatchDeleteOpen(true)}
          onClearSelection={() => setSelected(new Set())}
        />
      )}

      {/* Lista */}
      {isLoading ? (
        <div className="space-y-2 rounded-lg border p-3" role="status" aria-busy="true" aria-live="polite">
          <span className="sr-only">Carregando categorias...</span>
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      ) : categories.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-muted-foreground border rounded-lg">
          <Tag className="h-10 w-10 mb-3 opacity-40" aria-hidden />
          <p className="text-sm">Nenhuma categoria criada</p>
          <Button variant="link" onClick={openNew} className="mt-2">
            Criar primeira categoria
          </Button>
        </div>
      ) : (
        <>
          <p className="sr-only" role="status" aria-live="polite">
            {visibleTree.length} categoria(s) listada(s)
          </p>

          {/* Mobile: lista compacta */}
          <div className="md:hidden rounded-lg border overflow-hidden">
            <div className="flex items-center gap-2 border-b bg-muted/50 px-3 py-2">
              <Checkbox
                checked={selected.size === tree.length && tree.length > 0}
                onCheckedChange={toggleAll}
                aria-label="Selecionar todas as categorias"
                className="h-5 w-5"
              />
              <span className="text-xs text-muted-foreground">
                {visibleTree.length} categoria(s)
              </span>
            </div>
            {visibleTree.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-sm text-muted-foreground">
                Nenhuma categoria encontrada
                {hasFilters && (
                  <Button variant="outline" size="sm" onClick={clearFilters}>Limpar filtros</Button>
                )}
              </div>
            ) : (
              <ul className="divide-y" role="tree" aria-label="Árvore de categorias">
                {visibleTree.map((cat) => (
                  <CategoryMobileRow
                    key={cat.id}
                    cat={cat}
                    isSelected={selected.has(cat.id)}
                    isCollapsed={collapsed.has(cat.id)}
                    onToggleSelect={toggleSelect}
                    onToggleCollapse={toggleCollapse}
                    onEdit={openEdit}
                    onAddChild={openAddChild}
                    onDelete={setDeleteId}
                    companyMap={companyMap}
                    onToggleActive={handleToggleActive}
                    catCompanyMap={catCompanyMap}
                  />
                ))}
              </ul>
            )}
          </div>


          {/* Desktop: tabela com drag-and-drop */}
          <div className="hidden md:block border rounded-lg overflow-hidden">
            <Table className="w-full table-fixed">
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="w-8 md:w-10 px-2 md:px-4">
                    <Checkbox
                      checked={selected.size === tree.length && tree.length > 0}
                      onCheckedChange={toggleAll}
                      aria-label="Selecionar todas as categorias"
                    />
                  </TableHead>
                  <TableHead className="hidden md:table-cell w-10 text-xs"></TableHead>
                  <TableHead className="text-xs">Descrição</TableHead>
                  <TableHead className="hidden md:table-cell w-24 text-xs text-center">Tipo</TableHead>
                  <TableHead className="text-xs hidden md:table-cell">Visibilidade</TableHead>
                  <TableHead className="hidden md:table-cell w-32 text-xs text-center">Lançamentos</TableHead>
                  <TableHead className="w-[104px] md:w-28 text-xs text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <DragDropContext onDragEnd={onDragEnd}>
                <Droppable droppableId="categories">
                  {(provided) => (
                    <TableBody ref={provided.innerRef} {...provided.droppableProps}>
                      {visibleTree.map((cat, index) => (
                        <CategoryRow
                          key={cat.id}
                          cat={cat}
                          index={index}
                          isSelected={selected.has(cat.id)}
                          isCollapsed={collapsed.has(cat.id)}
                          onToggleSelect={toggleSelect}
                          onToggleCollapse={toggleCollapse}
                          onEdit={openEdit}
                          onAddChild={openAddChild}
                          onDelete={setDeleteId}
                          companyMap={companyMap}
                          onToggleActive={handleToggleActive}
                          catCompanyMap={catCompanyMap}
                        />
                      ))}

                      {provided.placeholder}
                      {visibleTree.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center py-8 text-sm text-muted-foreground">
                            <div className="flex flex-col items-center gap-2">
                              Nenhuma categoria encontrada
                              {hasFilters && (
                                <Button variant="outline" size="sm" onClick={clearFilters}>Limpar filtros</Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  )}
                </Droppable>
              </DragDropContext>
            </Table>
          </div>
        </>
      )}


      {/* FAB mobile */}
      <button
        onClick={openNew}
        type="button"
        aria-label="Nova categoria"
        className="fixed bottom-20 right-4 z-50 md:hidden flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <Plus className="h-6 w-6" aria-hidden />
      </button>


      <CategoryFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSaved={() => refetchAll()}
        editCategory={editCat}
        defaultParentId={defaultParentId}
        defaultType={defaultType}
      />

      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir categoria?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. A categoria será removida permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={batchDeleteOpen} onOpenChange={setBatchDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir {selected.size} categoria(s)?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. As categorias selecionadas serão removidas permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={batchDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleBatchDelete} disabled={batchDeleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {batchDeleting ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!pendingToggle} onOpenChange={(open) => !open && setPendingToggle(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingToggle?.active ? "Permitir lançamentos" : "Bloquear lançamentos"} nas subcategorias?
            </AlertDialogTitle>
            <AlertDialogDescription>
              A categoria "{pendingToggle?.cat.name}" possui {pendingToggle?.childIds.length} subcategoria(s).
              Você pode aplicar a mesma regra a todas elas ou alterar somente esta categoria.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-row">
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <Button
              variant="outline"
              onClick={() => {
                if (pendingToggle) applyActive([pendingToggle.cat.id], pendingToggle.active);
                setPendingToggle(null);
              }}
            >
              Somente esta
            </Button>
            <AlertDialogAction
              onClick={() => {
                if (pendingToggle)
                  applyActive([pendingToggle.cat.id, ...pendingToggle.childIds], pendingToggle.active);
                setPendingToggle(null);
              }}
            >
              Aplicar às subcategorias
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <BatchVisibilityDialog
        open={batchVisibilityOpen}
        onOpenChange={setBatchVisibilityOpen}
        selectedCount={selected.size}
        visiblePf={batchVisiblePf}
        setVisiblePf={setBatchVisiblePf}
        companies={companies}
        selectedCompanies={batchSelectedCompanies}
        toggleCompany={(id) =>
          setBatchSelectedCompanies((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
          })
        }
        onApply={handleBatchVisibility}
        saving={batchVisibilitySaving}
      />

    </div>
  );
}
