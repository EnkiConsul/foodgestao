import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";

const ICON_OPTIONS = [
  "shopping-cart", "utensils", "car", "home", "heart", "briefcase",
  "gift", "book", "music", "plane", "wifi", "zap",
  "coffee", "shirt", "dumbbell", "graduation-cap", "baby", "dog",
];

const COLOR_OPTIONS = [
  "#ef4444", "#f59e0b", "#22c55e", "#3b82f6", "#6366f1",
  "#8b5cf6", "#ec4899", "#14b8a6", "#f97316", "#64748b",
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  editCategory?: Tables<"categories"> | null;
}

export function CategoryFormDialog({ open, onOpenChange, onSaved, editCategory }: Props) {
  const { user } = useAuth();
  const { contextType } = useCompanyContext();
  const [name, setName] = useState("");
  const [type, setType] = useState<"receita" | "despesa">("despesa");
  const [icon, setIcon] = useState("shopping-cart");
  const [color, setColor] = useState("#3b82f6");
  const [parentId, setParentId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const { data: allCategories = [] } = useQuery({
    queryKey: ["categories-for-parent", user?.id, contextType],
    enabled: !!user && open,
    queryFn: async () => {
      const { data } = await supabase
        .from("categories")
        .select("*")
        .eq("user_id", user!.id)
        .or(contextType === "pf" ? "context.is.null,context.eq.pf" : "context.is.null,context.eq.pj")
        .is("parent_id", null)
        .order("transaction_type")
        .order("name");
      return data ?? [];
    },
  });

  // Filter parent options: same type, exclude self
  const parentOptions = allCategories.filter(
    (c) => c.transaction_type === type && c.id !== editCategory?.id
  );

  useEffect(() => {
    if (editCategory) {
      setName(editCategory.name);
      setType(editCategory.transaction_type as "receita" | "despesa");
      setIcon(editCategory.icon ?? "shopping-cart");
      setColor(editCategory.color ?? "#3b82f6");
      setParentId(editCategory.parent_id ?? null);
    } else {
      setName("");
      setType("despesa");
      setIcon("shopping-cart");
      setColor("#3b82f6");
      setParentId(null);
    }
  }, [editCategory, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!name.trim()) return toast.error("Informe o nome");

    setSaving(true);

    if (editCategory) {
      const { error } = await supabase
        .from("categories")
        .update({ name: name.trim(), transaction_type: type, icon, color, parent_id: parentId })
        .eq("id", editCategory.id);
      if (error) toast.error("Erro ao atualizar", { description: error.message });
      else { toast.success("Categoria atualizada!"); onOpenChange(false); onSaved(); }
    } else {
      const { error } = await supabase.from("categories").insert({
        user_id: user.id,
        name: name.trim(),
        transaction_type: type,
        icon,
        color,
        context: contextType,
        parent_id: parentId,
      });
      if (error) toast.error("Erro ao criar", { description: error.message });
      else { toast.success("Categoria criada!"); setName(""); onOpenChange(false); onSaved(); }
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editCategory ? "Editar Categoria" : "Nova Categoria"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Nome</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Alimentação" maxLength={50} />
          </div>

          <div className="space-y-2">
            <Label>Tipo</Label>
            <Select value={type} onValueChange={(v) => setType(v as "receita" | "despesa")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="despesa">Despesa</SelectItem>
                <SelectItem value="receita">Receita</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Categoria Pai (opcional)</Label>
            <Select value={parentId ?? "__none__"} onValueChange={(v) => setParentId(v === "__none__" ? null : v)}>
              <SelectTrigger><SelectValue placeholder="Nenhuma (raiz)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Nenhuma (raiz)</SelectItem>
                {parentOptions.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {parentOptions.length === 0 && (
              <p className="text-xs text-muted-foreground">Crie categorias raiz do mesmo tipo primeiro</p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Ícone</Label>
            <div className="grid grid-cols-9 gap-1.5">
              {ICON_OPTIONS.map((ic) => (
                <button
                  key={ic}
                  type="button"
                  onClick={() => setIcon(ic)}
                  className={`flex items-center justify-center h-8 w-8 rounded-md border text-xs transition-colors ${
                    icon === ic ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted"
                  }`}
                  title={ic}
                >
                  {ic.slice(0, 2).toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Cor</Label>
            <div className="flex gap-2 flex-wrap">
              {COLOR_OPTIONS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`h-7 w-7 rounded-full border-2 transition-transform ${
                    color === c ? "border-foreground scale-110" : "border-transparent"
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          <Button type="submit" className="w-full" disabled={saving}>
            {saving ? "Salvando..." : editCategory ? "Atualizar" : "Criar Categoria"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
