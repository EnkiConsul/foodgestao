import { useState, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { CategoryFormDialog } from "@/components/categories/CategoryFormDialog";
import { Plus, Search, Tag, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";

export default function Categorias() {
  const { user } = useAuth();
  const { contextType } = useCompanyContext();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editCat, setEditCat] = useState<Tables<"categories"> | null>(null);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [deleteId, setDeleteId] = useState<string | null>(null);

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

  const despesas = filtered.filter((c) => c.transaction_type === "despesa");
  const receitas = filtered.filter((c) => c.transaction_type === "receita");

  const confirmDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("categories").delete().eq("id", deleteId);
    if (error) toast.error("Erro ao excluir", { description: error.message });
    else { toast.success("Categoria excluída"); refetch(); }
    setDeleteId(null);
  };

  const openEdit = (cat: Tables<"categories">) => {
    setEditCat(cat);
    setDialogOpen(true);
  };

  const openNew = () => {
    setEditCat(null);
    setDialogOpen(true);
  };

  const renderGroup = (title: string, items: typeof filtered, typeColor: string) => {
    if (items.length === 0) return null;
    return (
      <div className="space-y-2">
        <h3 className={`text-sm font-semibold ${typeColor}`}>{title} ({items.length})</h3>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((cat) => (
            <Card key={cat.id} className="shadow-sm hover:shadow transition-shadow">
              <CardContent className="flex items-center gap-3 p-3">
                <div
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white text-xs font-bold"
                  style={{ backgroundColor: cat.color ?? "hsl(var(--primary))" }}
                >
                  {cat.icon ? cat.icon.slice(0, 2).toUpperCase() : cat.name.slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{cat.name}</p>
                  <Badge variant="secondary" className="text-[10px] h-4 px-1.5 mt-0.5">
                    {cat.transaction_type === "despesa" ? "Despesa" : "Receita"}
                  </Badge>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-primary"
                    onClick={() => openEdit(cat)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => setDeleteId(cat.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Categorias</h1>
          <p className="text-sm text-muted-foreground">Organize suas categorias de receita e despesa</p>
        </div>
        <Button onClick={openNew} className="hidden md:flex">
          <Plus className="h-4 w-4 mr-2" /> Nova Categoria
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar categoria..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" maxLength={50} />
        </div>
        <Tabs value={filterType} onValueChange={setFilterType}>
          <TabsList>
            <TabsTrigger value="all">Todas</TabsTrigger>
            <TabsTrigger value="despesa">Despesas</TabsTrigger>
            <TabsTrigger value="receita">Receitas</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Categories by group */}
      {categories.length === 0 ? (
        <Card className="shadow-sm">
          <CardContent className="flex flex-col items-center py-12 text-muted-foreground">
            <Tag className="h-10 w-10 mb-3 opacity-40" />
            <p className="text-sm">Nenhuma categoria criada</p>
            <Button variant="link" onClick={openNew} className="mt-2">
              Criar primeira categoria
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {renderGroup("Despesas", despesas, "text-destructive")}
          {renderGroup("Receitas", receitas, "text-success")}
          {filtered.length === 0 && categories.length > 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">Nenhuma categoria encontrada</p>
          )}
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
