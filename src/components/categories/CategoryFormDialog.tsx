import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { categorySchema, validateWithToast } from "@/lib/validations";
import type { Tables } from "@/integrations/supabase/types";

const COLOR_OPTIONS = [
  "#ef4444", "#f59e0b", "#22c55e", "#3b82f6", "#6366f1",
  "#8b5cf6", "#ec4899", "#14b8a6", "#f97316", "#64748b",
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  editCategory?: Tables<"categories"> | null;
  defaultParentId?: string | null;
  defaultType?: "receita" | "despesa";
}

export function CategoryFormDialog({ open, onOpenChange, onSaved, editCategory, defaultParentId, defaultType }: Props) {
  const { user } = useAuth();
  const { contextType } = useCompanyContext();
  const [name, setName] = useState("");
  const [type, setType] = useState<"receita" | "despesa">("despesa");
  const [color, setColor] = useState("#3b82f6");
  const [parentId, setParentId] = useState<string | null>(null);
  const [visiblePf, setVisiblePf] = useState(true);
  const [selectedCompanies, setSelectedCompanies] = useState<Set<string>>(new Set());
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
        .order("sort_order")
        .order("transaction_type")
        .order("name");
      return data ?? [];
    },
  });

  const { data: companies = [] } = useQuery({
    queryKey: ["companies-for-category", user?.id],
    enabled: !!user && open,
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


  useEffect(() => {
    if (!open) return;
    if (editCategory) {
      setName(editCategory.name);
      setType(editCategory.transaction_type as "receita" | "despesa");
      setColor(editCategory.color ?? "#3b82f6");
      setParentId(editCategory.parent_id ?? null);
      setVisiblePf((editCategory as any).visible_pf ?? true);
      // Load linked companies
      supabase
        .from("category_companies")
        .select("company_id")
        .eq("category_id", editCategory.id)
        .then(({ data }) => {
          setSelectedCompanies(new Set((data ?? []).map((d) => d.company_id)));
        });
    } else {
      setName("");
      setType(defaultType ?? "despesa");
      setColor("#3b82f6");
      setParentId(defaultParentId || null);
      setVisiblePf(true);
      setSelectedCompanies(new Set(companies.map((c) => c.id)));
    }
  }, [editCategory, open, defaultParentId, defaultType]);

  // Filter parent options: same type, exclude self
  const parentOptions = allCategories.filter(
    (c) => c.transaction_type === type && c.id !== editCategory?.id
  );

  const toggleCompany = (companyId: string) => {
    setSelectedCompanies((prev) => {
      const next = new Set(prev);
      if (next.has(companyId)) next.delete(companyId);
      else next.add(companyId);
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id) return;
    const catValidated = validateWithToast(categorySchema, { name, transaction_type: type, color }, toast.error);
    if (!catValidated) return;

    setSaving(true);

    if (editCategory) {
      const { error } = await supabase
        .from("categories")
        .update({ name: name.trim(), transaction_type: type, color, parent_id: parentId || null, visible_pf: visiblePf } as any)
        .eq("id", editCategory.id);
      if (error) {
        toast.error("Erro ao atualizar", { description: error.message });
        setSaving(false);
        return;
      }

      // Sync company visibility
      await supabase.from("category_companies").delete().eq("category_id", editCategory.id);
      if (selectedCompanies.size > 0) {
        const rows = Array.from(selectedCompanies).map((company_id) => ({
          category_id: editCategory.id,
          company_id,
        }));
        await supabase.from("category_companies").insert(rows);
      }

      await supabase.rpc("insert_audit_log", {
        _action: "category_updated",
        _entity_type: "category",
        _entity_id: editCategory.id,
        _details: { target_name: name.trim() },
      });
      toast.success("Categoria atualizada!");
      onOpenChange(false);
      onSaved();
    } else {
      const { data: newCat, error } = await supabase.from("categories").insert({
        user_id: user.id,
        name: name.trim(),
        transaction_type: type,
        color,
        context: contextType,
        parent_id: parentId || null,
        visible_pf: visiblePf,
      } as any).select("id").single();

      if (error) {
        toast.error("Erro ao criar", { description: error.message });
        setSaving(false);
        return;
      }

      // Save company visibility
      if (newCat && selectedCompanies.size > 0) {
        const rows = Array.from(selectedCompanies).map((company_id) => ({
          category_id: newCat.id,
          company_id,
        }));
        await supabase.from("category_companies").insert(rows);
      }

      await supabase.rpc("insert_audit_log", {
        _action: "category_created",
        _entity_type: "category",
        _entity_id: newCat?.id,
        _details: { target_name: name.trim() },
      });
      toast.success("Categoria criada!");
      setName("");
      onOpenChange(false);
      onSaved();
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
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
            <Select value={parentId ?? "__none__"} onValueChange={(v) => setParentId(!v || v === "__none__" ? null : v)}>
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

          {/* Visibility section */}
          <div className="space-y-3 border-t pt-4">
            <Label className="text-sm font-semibold">Visibilidade</Label>
            <p className="text-xs text-muted-foreground">Selecione onde esta categoria ficará disponível</p>

            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={visiblePf} onCheckedChange={(v) => setVisiblePf(!!v)} />
              Pessoa Física (PF)
            </label>

            {companies.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Empresas</p>
                {companies.map((company) => (
                  <label key={company.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={selectedCompanies.has(company.id)}
                      onCheckedChange={() => toggleCompany(company.id)}
                    />
                    {company.name}
                  </label>
                ))}
              </div>
            )}
          </div>

          <Button type="submit" className="w-full" disabled={saving}>
            {saving ? "Salvando..." : editCategory ? "Atualizar" : "Criar Categoria"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
