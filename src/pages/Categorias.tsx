import { useState, useMemo, useCallback, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { CategoryFormDialog } from "@/components/categories/CategoryFormDialog";
import { Plus, Search, Tag, Pencil, Trash2, ChevronRight, Filter, ChevronsUpDown, GripVertical, FolderTree, Eye } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";

type Category = Tables<"categories">;

type TreeNode = Category & { depth: number; hasChildren: boolean; index: string };

function buildTree(categories: Category[]): TreeNode[] {
  const map = new Map<string, Category[]>();
  const roots: Category[] = [];
  const childSet = new Set<string>();

  for (const cat of categories) {
    if (cat.parent_id) {
      const children = map.get(cat.parent_id) || [];
      children.push(cat);
      map.set(cat.parent_id, children);
      childSet.add(cat.parent_id);
    } else {
      roots.push(cat);
    }
  }

  const result: TreeNode[] = [];
  function walk(items: Category[], depth: number, parentIndex: string) {
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const idx = parentIndex ? `${parentIndex}.${i + 1}` : `${i + 1}`;
      result.push({ ...item, depth, hasChildren: childSet.has(item.id), index: idx });
      const children = map.get(item.id);
      if (children) walk(children, depth + 1, idx);
    }
  }
  walk(roots, 0, "");
  return result;
}

export default function Categorias() {
  const { user } = useAuth();
  const { contextType } = useCompanyContext();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editCat, setEditCat] = useState<Category | null>(null);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [defaultParentId, setDefaultParentId] = useState<string | null>(null);
  const [defaultType, setDefaultType] = useState<"receita" | "despesa" | undefined>(undefined);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [batchParentId, setBatchParentId] = useState<string>("__none__");
  const [batchSaving, setBatchSaving] = useState(false);
  const [batchDeleteOpen, setBatchDeleteOpen] = useState(false);
  const [batchDeleting, setBatchDeleting] = useState(false);
  const [batchVisibilityOpen, setBatchVisibilityOpen] = useState(false);
  const [batchVisiblePf, setBatchVisiblePf] = useState(true);
  const [batchSelectedCompanies, setBatchSelectedCompanies] = useState<Set<string>>(new Set());
  const [batchVisibilitySaving, setBatchVisibilitySaving] = useState(false);

  const handleBatchChangeParent = async () => {
    if (selected.size === 0) return;
    setBatchSaving(true);
    const newParentId = batchParentId === "__none__" ? null : batchParentId;
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
      refetch();
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
      refetch();
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
    refetch();
  };

  const { data: categories = [], refetch } = useQuery({
    queryKey: ["categories-page", user?.id, contextType],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("categories")
        .select("*")
        .eq("user_id", user!.id)
        .or(contextType === "pf" ? "context.is.null,context.eq.pf" : "context.is.null,context.eq.pj")
        .order("transaction_type")
        .order("sort_order")
        .order("name");
      return data ?? [];
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

  const { data: categoryCompanies = [] } = useQuery({
    queryKey: ["category-companies", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("category_companies")
        .select("category_id, company_id");
      return data ?? [];
    },
  });

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
      return matchSearch && matchType;
    });
  }, [categories, search, filterType]);

  const tree = useMemo(() => buildTree(filtered), [filtered]);

  // Persist hierarchy_index to database whenever tree changes
  const persistHierarchyIndex = useCallback(async () => {
    if (!categories.length) return;
    const fullTree = buildTree(categories);
    const updates = fullTree
      .filter((node) => node.hierarchy_index !== `${node.index}.`)
      .map((node) =>
        supabase.from("categories").update({ hierarchy_index: `${node.index}.` }).eq("id", node.id)
      );
    if (updates.length > 0) await Promise.all(updates);
  }, [categories]);

  useEffect(() => {
    persistHierarchyIndex();
  }, [persistHierarchyIndex]);

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
    const { error } = await supabase.from("categories").delete().eq("id", deleteId);
    if (error) toast.error("Erro ao excluir", { description: error.message });
    else { toast.success("Categoria excluída"); refetch(); }
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
    setDefaultType(parent.transaction_type as "receita" | "despesa");
    setDialogOpen(true);
  };

  const onDragEnd = async (result: DropResult) => {
    if (!result.destination) return;
    const srcIdx = result.source.index;
    const destIdx = result.destination.index;
    if (srcIdx === destIdx) return;

    const draggedItem = visibleTree[srcIdx];
    // Find siblings at same level with same parent and type
    const siblings = filtered
      .filter((c) => c.parent_id === draggedItem.parent_id && c.transaction_type === draggedItem.transaction_type)
      .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));

    const oldIdx = siblings.findIndex((c) => c.id === draggedItem.id);
    // Determine target based on visible tree destination
    const targetItem = visibleTree[destIdx];
    const newIdx = siblings.findIndex((c) => c.id === targetItem.id);

    if (oldIdx === -1 || newIdx === -1 || oldIdx === newIdx) return;

    // Reorder siblings
    const reordered = [...siblings];
    reordered.splice(oldIdx, 1);
    reordered.splice(newIdx, 0, draggedItem);

    // Update sort_order for all reordered siblings
    const updates = reordered.map((cat, i) =>
      supabase.from("categories").update({ sort_order: i }).eq("id", cat.id)
    );
    await Promise.all(updates);
    refetch();
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

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Categorias</h1>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={openNew} variant="outline" size="sm" className="gap-1.5">
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Adicionar</span>
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => {
            const parents = tree.filter((c) => c.hasChildren).map((c) => c.id);
            if (collapsed.size >= parents.length && parents.length > 0) {
              setCollapsed(new Set());
            } else {
              setCollapsed(new Set(parents));
            }
          }}
        >
          <ChevronsUpDown className="h-4 w-4" />
          <span className="hidden sm:inline">{collapsed.size > 0 ? "Expandir" : "Colapsar"}</span>
        </Button>

        <Tabs value={filterType} onValueChange={setFilterType}>
          <TabsList className="h-8">
            <TabsTrigger value="all" className="text-xs px-2.5 h-7">Todas</TabsTrigger>
            <TabsTrigger value="despesa" className="text-xs px-2.5 h-7">Despesas</TabsTrigger>
            <TabsTrigger value="receita" className="text-xs px-2.5 h-7">Receitas</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex-1" />

        <div className="relative min-w-[160px] max-w-[260px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Buscar..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-xs"
            maxLength={50}
          />
        </div>
        <Button variant="outline" size="sm" className="h-8 gap-1.5">
          <Filter className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Filtrar</span>
        </Button>
      </div>

      {/* Batch action bar */}
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 p-3 rounded-lg border bg-muted/50">
          <span className="text-sm font-medium">{selected.size} selecionada(s)</span>
          <div className="flex items-center gap-2">
            <FolderTree className="h-4 w-4 text-muted-foreground" />
            <Select value={batchParentId} onValueChange={setBatchParentId}>
              <SelectTrigger className="h-8 w-[200px] text-xs">
                <SelectValue placeholder="Categoria Raiz" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Nenhuma (raiz)</SelectItem>
                {categories
                  .filter((c) => !selected.has(c.id))
                  .map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <Button size="sm" className="h-8 text-xs" onClick={handleBatchChangeParent} disabled={batchSaving}>
              {batchSaving ? "Movendo..." : "Mover"}
            </Button>
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={() => {
              setBatchVisiblePf(true);
              setBatchSelectedCompanies(new Set(companies.map((c) => c.id)));
              setBatchVisibilityOpen(true);
            }}>
              <Eye className="h-3.5 w-3.5" />
              Visibilidade
            </Button>
            <Button variant="destructive" size="sm" className="h-8 text-xs gap-1" onClick={() => setBatchDeleteOpen(true)}>
              <Trash2 className="h-3.5 w-3.5" />
              Excluir
            </Button>
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setSelected(new Set())}>
              Limpar seleção
            </Button>
          </div>
        </div>
      )}

      {/* Table */}
      {categories.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-muted-foreground border rounded-lg">
          <Tag className="h-10 w-10 mb-3 opacity-40" />
          <p className="text-sm">Nenhuma categoria criada</p>
          <Button variant="link" onClick={openNew} className="mt-2">
            Criar primeira categoria
          </Button>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="w-10">
                  <Checkbox
                    checked={selected.size === tree.length && tree.length > 0}
                    onCheckedChange={toggleAll}
                  />
                </TableHead>
                <TableHead className="w-10 text-xs"></TableHead>
                <TableHead className="text-xs">Descrição</TableHead>
                <TableHead className="w-24 text-xs text-center">Tipo</TableHead>
                <TableHead className="text-xs hidden md:table-cell">Visibilidade</TableHead>
                <TableHead className="w-24 text-xs text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <DragDropContext onDragEnd={onDragEnd}>
              <Droppable droppableId="categories">
                {(provided) => (
                  <TableBody ref={provided.innerRef} {...provided.droppableProps}>
                    {visibleTree.map((cat, index) => (
                      <Draggable key={cat.id} draggableId={cat.id} index={index}>
                        {(provided, snapshot) => (
                          <TableRow
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            className={`group ${snapshot.isDragging ? "bg-muted shadow-md" : ""}`}
                          >
                            <TableCell className="py-1.5 px-4">
                              <Checkbox
                                checked={selected.has(cat.id)}
                                onCheckedChange={() => toggleSelect(cat.id)}
                              />
                            </TableCell>
                            <TableCell className="py-1.5 px-1">
                              <div
                                {...provided.dragHandleProps}
                                className="flex items-center justify-center cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"
                              >
                                <GripVertical className="h-4 w-4" />
                              </div>
                            </TableCell>
                            <TableCell className="py-1.5">
                              <div className="flex items-center gap-1" style={{ paddingLeft: `${cat.depth * 24}px` }}>
                                {cat.hasChildren ? (
                                  <button
                                    onClick={() => toggleCollapse(cat.id)}
                                    className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-all"
                                  >
                                    <ChevronRight className={`h-3.5 w-3.5 transition-transform ${collapsed.has(cat.id) ? "" : "rotate-90"}`} />
                                  </button>
                                ) : (
                                  <span className="w-[18px]" />
                                )}
                                <div
                                  className="h-3 w-3 shrink-0 rounded-full"
                                  style={{ backgroundColor: cat.color ?? "hsl(var(--primary))" }}
                                />
                                <span className={`text-sm ${cat.depth === 0 ? "font-semibold" : ""}`}>
                                  <span className="text-muted-foreground font-mono text-xs mr-1.5">{cat.index}.</span>
                                  {cat.name}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell className="py-1.5 text-center">
                              <Badge
                                variant="secondary"
                                className={`text-[10px] h-5 px-1.5 ${
                                  cat.transaction_type === "receita"
                                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                                    : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                                }`}
                              >
                                {cat.transaction_type === "despesa" ? "Despesa" : "Receita"}
                              </Badge>
                            </TableCell>
                            <TableCell className="py-1.5 hidden md:table-cell">
                              <div className="flex items-center gap-1 flex-wrap">
                                {(cat as any).visible_pf && (
                                  <Badge variant="outline" className="text-[10px] h-4 px-1.5">PF</Badge>
                                )}
                                {(catCompanyMap.get(cat.id) || []).map((compId) => (
                                  <Badge key={compId} variant="outline" className="text-[10px] h-4 px-1.5">
                                    {companyMap.get(compId) ?? "Empresa"}
                                  </Badge>
                                ))}
                                {!(cat as any).visible_pf && !(catCompanyMap.get(cat.id) || []).length && (
                                  <span className="text-[10px] text-muted-foreground">Sem visibilidade</span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="py-1.5 text-right">
                              <div className="flex justify-end gap-0.5">
                                <TooltipProvider delayDuration={300}>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-primary" onClick={() => openAddChild(cat)}>
                                        <Plus className="h-3.5 w-3.5" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent side="top"><p>Adicionar filho</p></TooltipContent>
                                  </Tooltip>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-primary" onClick={() => openEdit(cat)}>
                                        <Pencil className="h-3.5 w-3.5" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent side="top"><p>Editar</p></TooltipContent>
                                  </Tooltip>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => setDeleteId(cat.id)}>
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent side="top"><p>Excluir</p></TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                    {visibleTree.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-sm text-muted-foreground">
                          Nenhuma categoria encontrada
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                )}
              </Droppable>
            </DragDropContext>
          </Table>
        </div>
      )}

      {/* FAB mobile */}
      <button
        onClick={openNew}
        className="fixed bottom-20 right-4 z-50 md:hidden flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 transition-colors"
      >
        <Plus className="h-6 w-6" />
      </button>

      <CategoryFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSaved={() => refetch()}
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

      <Dialog open={batchVisibilityOpen} onOpenChange={setBatchVisibilityOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Alterar Visibilidade ({selected.size} categorias)</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Selecione onde as categorias ficarão disponíveis</p>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={batchVisiblePf} onCheckedChange={(v) => setBatchVisiblePf(!!v)} />
              Pessoa Física (PF)
            </label>
            {companies.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Empresas</p>
                {companies.map((company) => (
                  <label key={company.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={batchSelectedCompanies.has(company.id)}
                      onCheckedChange={() => {
                        setBatchSelectedCompanies((prev) => {
                          const next = new Set(prev);
                          if (next.has(company.id)) next.delete(company.id);
                          else next.add(company.id);
                          return next;
                        });
                      }}
                    />
                    {company.name}
                  </label>
                ))}
              </div>
            )}
            <Button className="w-full" onClick={handleBatchVisibility} disabled={batchVisibilitySaving}>
              {batchVisibilitySaving ? "Salvando..." : "Aplicar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
