import { useState, useMemo } from "react";
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
import { Plus, Search, Tag, Pencil, Trash2, ChevronUp, ChevronDown, ChevronRight, Filter } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";

type Category = Tables<"categories">;

type TreeNode = Category & { depth: number; hasChildren: boolean };

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
  function walk(items: Category[], depth: number) {
    for (const item of items) {
      result.push({ ...item, depth, hasChildren: childSet.has(item.id) });
      const children = map.get(item.id);
      if (children) walk(children, depth + 1);
    }
  }
  walk(roots, 0);
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

  const filtered = useMemo(() => {
    return categories.filter((c) => {
      const matchSearch = !search || c.name.toLowerCase().includes(search.toLowerCase());
      const matchType = filterType === "all" || c.transaction_type === filterType;
      return matchSearch && matchType;
    });
  }, [categories, search, filterType]);

  const tree = useMemo(() => buildTree(filtered), [filtered]);

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

  const moveSort = async (cat: Category, direction: "up" | "down") => {
    const newOrder = direction === "up" ? cat.sort_order - 1 : cat.sort_order + 1;
    if (newOrder < 0) return;
    await supabase.from("categories").update({ sort_order: newOrder }).eq("id", cat.id);
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
                <TableHead className="w-20 text-xs">Ordenar</TableHead>
                <TableHead className="text-xs">Descrição</TableHead>
                <TableHead className="w-24 text-xs text-center">Tipo</TableHead>
                <TableHead className="w-24 text-xs text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleTree.map((cat) => (
                <TableRow key={cat.id} className="group">
                  <TableCell className="py-1.5 px-4">
                    <Checkbox
                      checked={selected.has(cat.id)}
                      onCheckedChange={() => toggleSelect(cat.id)}
                    />
                  </TableCell>
                  <TableCell className="py-1.5">
                    <div className="flex items-center gap-0.5">
                      <button
                        onClick={() => moveSort(cat, "up")}
                        className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <ChevronUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => moveSort(cat, "down")}
                        className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <ChevronDown className="h-3.5 w-3.5" />
                      </button>
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
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-white text-[10px] font-bold"
                        style={{ backgroundColor: cat.color ?? "hsl(var(--primary))" }}
                      >
                        {cat.icon ? cat.icon.slice(0, 2).toUpperCase() : cat.name.slice(0, 2).toUpperCase()}
                      </div>
                      <span className={`text-sm ${cat.depth === 0 ? "font-semibold" : ""}`}>
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
                  <TableCell className="py-1.5 text-right">
                    <div className="flex justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
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
              ))}
              {visibleTree.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-sm text-muted-foreground">
                    Nenhuma categoria encontrada
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
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
    </div>
  );
}
