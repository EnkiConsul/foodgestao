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
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Check, ChevronsUpDown, Sparkles, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
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
  onSaved: (newId?: string) => void;
  editCategory?: Tables<"categories"> | null;
  defaultParentId?: string | null;
  defaultType?: "receita" | "despesa";
  defaultName?: string;
}

export function CategoryFormDialog({ open, onOpenChange, onSaved, editCategory, defaultParentId, defaultType, defaultName }: Props) {
  const { user } = useAuth();
  const { contextType, selectedCompanyId } = useCompanyContext();
  const [name, setName] = useState("");
  const [type, setType] = useState<"receita" | "despesa">("despesa");
  const [color, setColor] = useState("#3b82f6");
  const [parentId, setParentId] = useState<string | null>(null);
  const [chartAccountId, setChartAccountId] = useState<string | null>(null);
  const [chartAccountPopoverOpen, setChartAccountPopoverOpen] = useState(false);
  const [visiblePf, setVisiblePf] = useState(true);
  const [subtype, setSubtype] = useState<string>("");
  const [aiDescription, setAiDescription] = useState<string>("");
  const [selectedCompanies, setSelectedCompanies] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [generatingAi, setGeneratingAi] = useState(false);

  const parentNameById = (id: string | null) => {
    if (!id) return null;
    return allCategories.find((c) => c.id === id)?.name ?? null;
  };

  const handleGenerateAiDescription = async () => {
    if (!name.trim()) {
      toast.error("Informe o nome da categoria antes de gerar a descrição.");
      return;
    }
    if (!subtype) {
      toast.error("Selecione o subtipo antes de gerar a descrição.");
      return;
    }
    setGeneratingAi(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-category-ai-description", {
        body: {
          name: name.trim(),
          subtype,
          transaction_type: type,
          parent_name: parentNameById(parentId),
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const desc = (data?.description ?? "").toString().slice(0, 500);
      if (!desc) throw new Error("Resposta vazia da IA");
      setAiDescription(desc);
      toast.success("Descrição gerada pela IA!");
    } catch (err: any) {
      const msg = err?.message ?? "Falha ao gerar descrição";
      if (/402|credit/i.test(msg)) {
        toast.error("Créditos de IA esgotados", { description: "Adicione créditos para continuar usando a IA." });
      } else if (/429|rate/i.test(msg)) {
        toast.error("Muitas requisições", { description: "Aguarde alguns segundos e tente novamente." });
      } else {
        toast.error("Erro ao gerar descrição", { description: msg });
      }
    } finally {
      setGeneratingAi(false);
    }
  };

  const { data: allCategories = [] } = useQuery({
    queryKey: ["categories-for-parent", user?.id, contextType, selectedCompanyId],
    enabled: !!user && open && (contextType === "pf" || !!selectedCompanyId),
    queryFn: async () => {
      if (contextType === "pj") {
        // Somente categorias vinculadas à empresa ativa
        const { data } = await supabase
          .from("categories")
          .select("*, category_companies!inner(company_id)")
          .or("context.is.null,context.eq.pj")
          .eq("category_companies.company_id", selectedCompanyId!)
          .order("sort_order")
          .order("transaction_type")
          .order("name");
        return data ?? [];
      }
      const { data } = await supabase
        .from("categories")
        .select("*")
        .eq("user_id", user!.id)
        .or("context.is.null,context.eq.pf")
        .eq("visible_pf", true)
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

  const { data: chartAccounts = [] } = useQuery({
    queryKey: ["chart-accounts-for-category", user?.id, contextType],
    enabled: !!user && open,
    queryFn: async () => {
      const { data } = await supabase
        .from("chart_accounts")
        .select("id, code, name")
        .eq("user_id", user!.id)
        .eq("context", contextType)
        .eq("is_active", true)
        .eq("allow_transactions", true)
        .order("code");
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
      setChartAccountId((editCategory as any).chart_account_id ?? null);
      setVisiblePf((editCategory as any).visible_pf ?? true);
      setSubtype((editCategory as any).category_subtype ?? "");
      setAiDescription((editCategory as any).ai_description ?? "");
      // Load linked companies
      supabase
        .from("category_companies")
        .select("company_id")
        .eq("category_id", editCategory.id)
        .then(({ data }) => {
          setSelectedCompanies(new Set((data ?? []).map((d) => d.company_id)));
        });
    } else {
      setName(defaultName ?? "");
      setType(defaultType ?? "despesa");
      setColor("#3b82f6");
      setParentId(defaultParentId || null);
      setChartAccountId(null);
      setVisiblePf(true);
      setSubtype("");
      setAiDescription("");
      setSelectedCompanies(new Set(companies.map((c) => c.id)));
    }
  }, [editCategory, open, defaultParentId, defaultType, defaultName]);

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
    const catValidated = validateWithToast(categorySchema, { name, transaction_type: type, color, category_subtype: subtype || undefined }, toast.error);
    if (!catValidated) return;

    setSaving(true);
    // Categorias raiz (sem pai) são salvas em CAIXA ALTA
    const finalName = parentId ? name.trim() : name.trim().toUpperCase();

    // Compute next sort_order for the target parent (append at end of siblings)
    const computeNextSortOrder = async (parentIdVal: string | null) => {
      let query = supabase
        .from("categories")
        .select("sort_order")
        .eq("user_id", user.id)
        .eq("transaction_type", type);
      query = parentIdVal ? query.eq("parent_id", parentIdVal) : query.is("parent_id", null);
      const { data } = await query.order("sort_order", { ascending: false }).limit(1);
      const max = data && data.length > 0 ? (data[0].sort_order ?? 0) : -1;
      return max + 1;
    };

    if (editCategory) {
      const parentChanged = (editCategory.parent_id ?? null) !== (parentId ?? null);
      const updatePayload: any = { name: finalName, transaction_type: type, color, parent_id: parentId || null, visible_pf: visiblePf, chart_account_id: chartAccountId, category_subtype: subtype || null, ai_description: aiDescription.trim() || null };
      if (parentChanged) {
        updatePayload.sort_order = await computeNextSortOrder(parentId || null);
      }
      const { error } = await supabase
        .from("categories")
        .update(updatePayload)
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
      const nextSort = await computeNextSortOrder(parentId || null);
      const { data: newCat, error } = await supabase.from("categories").insert({
        user_id: user.id,
        name: finalName,
        transaction_type: type,
        color,
        context: contextType,
        parent_id: parentId || null,
        visible_pf: visiblePf,
        chart_account_id: chartAccountId,
        sort_order: nextSort,
        category_subtype: subtype || null,
        ai_description: aiDescription.trim() || null,
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
      onSaved(newCat?.id);
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
            <Select value={parentId ?? "__none__"} onValueChange={(v) => setParentId(!v || v === "__none__" ? null : v)}>
              <SelectTrigger>
                <span className="truncate">
                  {parentId ? (parentNameById(parentId) ?? "Carregando...") : "Nenhuma (raiz)"}
                </span>
              </SelectTrigger>
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
            <Label>Conta Contábil (opcional)</Label>
            <Popover open={chartAccountPopoverOpen} onOpenChange={setChartAccountPopoverOpen}>

              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  role="combobox"
                  className="w-full justify-between font-normal"
                >
                  <span className="truncate">
                    {chartAccountId
                      ? (() => {
                          const ca = chartAccounts.find((c) => c.id === chartAccountId);
                          return ca ? `${ca.code} — ${ca.name}` : "Nenhuma";
                        })()
                      : "Nenhuma"}
                  </span>
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <Command
                  filter={(value, search) => {
                    if (!search) return 1;
                    return value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0;
                  }}
                >
                  <CommandInput placeholder="Buscar por código ou nome..." />
                  <CommandList>
                    <CommandEmpty>Nenhuma conta encontrada</CommandEmpty>
                    <CommandGroup>
                      <CommandItem
                        value="__none__ nenhuma"
                        onSelect={() => {
                          setChartAccountId(null);
                          setChartAccountPopoverOpen(false);
                        }}
                      >
                        <Check className={cn("mr-2 h-4 w-4", !chartAccountId ? "opacity-100" : "opacity-0")} />
                        Nenhuma
                      </CommandItem>
                      {chartAccounts.map((ca) => (
                        <CommandItem
                          key={ca.id}
                          value={`${ca.code} ${ca.name}`}
                          onSelect={() => {
                            setChartAccountId(ca.id);
                            setChartAccountPopoverOpen(false);
                          }}
                        >
                          <Check className={cn("mr-2 h-4 w-4", chartAccountId === ca.id ? "opacity-100" : "opacity-0")} />
                          <span className="font-mono text-xs mr-2">{ca.code}</span>
                          <span className="truncate">{ca.name}</span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            {chartAccounts.length === 0 && (
              <p className="text-xs text-muted-foreground">Cadastre em Contas Contábeis para vincular</p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Subtipo <span className="text-destructive">*</span></Label>
            <Select value={subtype} onValueChange={(v) => setSubtype(v)}>
              <SelectTrigger><SelectValue placeholder="Selecione o subtipo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="receita">Receita</SelectItem>
                <SelectItem value="saida">Saída</SelectItem>
                <SelectItem value="custo">Custo</SelectItem>
                <SelectItem value="despesa">Despesa</SelectItem>
                <SelectItem value="imposto">Imposto</SelectItem>
                <SelectItem value="investimento">Investimento</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Obrigatório. Usado para agrupar Receitas, Custos, Despesas, Impostos e Investimentos nos relatórios contábeis (DRE, Balanço).</p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label>Descrição da Categoria para a IA (opcional)</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleGenerateAiDescription}
                disabled={generatingAi || !name.trim() || !subtype}
                className="h-7 gap-1.5 text-xs"
              >
                {generatingAi ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                {generatingAi ? "Gerando..." : "Gerar com IA"}
              </Button>
            </div>
            <Textarea
              value={aiDescription}
              onChange={(e) => setAiDescription(e.target.value)}
              placeholder="Contexto para o agente classificar lançamentos automaticamente nesta categoria."
              rows={3}
              maxLength={500}
              disabled={generatingAi}
            />
            <p className="text-[10px] text-muted-foreground">
              A IA usa o nome e o subtipo para sugerir a descrição. Você pode editar antes de salvar.
            </p>
          </div>

          {editCategory && (editCategory as any).previous_index && (
            <div className="rounded-md border bg-muted/40 p-3 text-xs">
              <p className="text-muted-foreground">Índice anterior</p>
              <p className="font-mono">{(editCategory as any).previous_index}</p>
            </div>
          )}

          {!editCategory && (
            <div className="rounded-md border bg-muted/40 p-3 text-xs">
              <p className="text-muted-foreground">ID Interno</p>
              <p className="font-mono">Será gerado automaticamente (USR-####)</p>
            </div>
          )}





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
