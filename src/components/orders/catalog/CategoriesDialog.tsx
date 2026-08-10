import { useEffect, useMemo, useState } from "react";
import { Check, Loader2, Pencil, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  useOrdersCategories,
  useOrdersProducts,
  useSaveCategory,
} from "@/hooks/useOrdersCatalog";
import { CATALOG_STATE_LABELS, CATALOG_STATE_VARIANTS, type CatalogState } from "@/lib/orders/catalog";

interface Props {
  menuId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  readOnly?: boolean;
}

/** Gestão das categorias do cardápio: listar, renomear, desativar e reativar. */
export function CategoriesDialog({ menuId, open, onOpenChange, readOnly }: Props) {
  const { data: categories, isLoading } = useOrdersCategories(menuId);
  const { data: products } = useOrdersProducts(menuId, null);
  const saveCategory = useSaveCategory();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [newName, setNewName] = useState("");

  useEffect(() => {
    if (open) return;
    setEditingId(null);
    setEditingName("");
    setNewName("");
  }, [open]);

  const countByCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of products ?? []) {
      map.set(p.category_id, (map.get(p.category_id) ?? 0) + 1);
    }
    return map;
  }, [products]);

  const disabled = !!readOnly || !menuId;

  const commitRename = async (id: string) => {
    const trimmed = editingName.trim();
    if (!menuId || !trimmed) return;
    try {
      await saveCategory.mutateAsync({ id, menu_id: menuId, name: trimmed });
      setEditingId(null);
      setEditingName("");
    } catch {
      /* o hook já exibe o erro */
    }
  };

  const setState = async (id: string, name: string, state: CatalogState) => {
    if (!menuId) return;
    try {
      await saveCategory.mutateAsync({ id, menu_id: menuId, name, state });
    } catch {
      /* o hook já exibe o erro */
    }
  };

  const createCategory = async () => {
    const trimmed = newName.trim();
    if (!menuId || !trimmed) return;
    try {
      await saveCategory.mutateAsync({ menu_id: menuId, name: trimmed });
      setNewName("");
    } catch {
      /* o hook já exibe o erro */
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Categorias do cardápio</DialogTitle>
          <DialogDescription>
            Renomeie, desative ou reative as categorias. Categorias desativadas não aparecem no cardápio online.
          </DialogDescription>
        </DialogHeader>

        {!disabled && (
          <div className="flex gap-2">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Nova categoria (ex.: Bebidas)"
              maxLength={80}
              className="min-h-10"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void createCategory();
                }
              }}
            />
            <Button
              variant="outline"
              className="min-h-10 shrink-0"
              disabled={!newName.trim() || saveCategory.isPending}
              onClick={() => void createCategory()}
            >
              <Plus className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Criar</span>
            </Button>
          </div>
        )}

        <div className="max-h-[55vh] space-y-2 overflow-y-auto">
          {isLoading && (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}

          {!isLoading && (categories ?? []).length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nenhuma categoria neste cardápio.
            </p>
          )}

          {(categories ?? []).map((c) => {
            const state = (c.state ?? "active") as CatalogState;
            const isArchived = state === "archived";
            const count = countByCategory.get(c.id) ?? 0;
            return (
              <div key={c.id} className="flex items-center gap-2 rounded-md border p-2">
                {editingId === c.id ? (
                  <>
                    <Input
                      autoFocus
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      maxLength={80}
                      className="min-h-9 flex-1"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void commitRename(c.id);
                        }
                        if (e.key === "Escape") setEditingId(null);
                      }}
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="Salvar nome"
                      disabled={!editingName.trim() || saveCategory.isPending}
                      onClick={() => void commitRename(c.id)}
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" aria-label="Cancelar" onClick={() => setEditingId(null)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </>
                ) : (
                  <>
                    <span className={`min-w-0 flex-1 truncate text-sm ${isArchived ? "text-muted-foreground line-through" : ""}`}>
                      {c.name}
                    </span>
                    <Badge variant="outline" className="shrink-0">{count}</Badge>
                    <Badge variant={CATALOG_STATE_VARIANTS[state]} className="shrink-0">
                      {CATALOG_STATE_LABELS[state]}
                    </Badge>
                    {!disabled && (
                      <>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label="Renomear categoria"
                          onClick={() => { setEditingId(c.id); setEditingName(c.name); }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={isArchived ? "Reativar categoria" : "Desativar categoria"}
                          disabled={saveCategory.isPending}
                          onClick={() => void setState(c.id, c.name, isArchived ? "active" : "archived")}
                        >
                          {isArchived ? <RotateCcw className="h-4 w-4" /> : <Trash2 className="h-4 w-4 text-destructive" />}
                        </Button>
                      </>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
