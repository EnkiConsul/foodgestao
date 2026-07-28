import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import { CATEGORY_INDENT_STEP, categoryGuideLevels } from "@/lib/categories/display";
import { CategoryTypeBadge } from "@/components/categorias/CategoryTypeBadge";
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
        .select("id, code, name, parent_id, allow_transactions, short_code, is_tax")
        .eq("user_id", user!.id)
        .eq("context", contextType)
        .eq("is_active", true)
        .order("code");
      return (data ?? []) as any[];
    },
  });

  // Mesma ordenação e hierarquia da tela de Contas Contábeis
  const chartAccountOptions = (() => {
    const compareCodes = (a: string, b: string) => {
      const pa = String(a).split(".").map((s) => parseInt(s, 10));
      const pb = String(b).split(".").map((s) => parseInt(s, 10));
      const len = Math.max(pa.length, pb.length);
      for (let i = 0; i < len; i++) {
        const va = pa[i] ?? 0;
        const vb = pb[i] ?? 0;
        if (va !== vb) return va - vb;
      }
      return String(a).localeCompare(String(b));
    };
    const byParent = new Map<string | null, any[]>();
    const ids = new Set(chartAccounts.map((c: any) => c.id));
    chartAccounts.forEach((c: any) => {
      const key = c.parent_id && ids.has(c.parent_id) ? c.parent_id : null;
      if (!byParent.has(key)) byParent.set(key, []);
      byParent.get(key)!.push(c);
    });
    byParent.forEach((list) => list.sort((a, b) => compareCodes(a.code, b.code)));
    const out: { acc: any; depth: number }[] = [];
    const walk = (parent: string | null, depth: number) => {
      (byParent.get(parent) ?? []).forEach((acc: any) => {
        out.push({ acc, depth });
        walk(acc.id, depth + 1);
      });
    };
    walk(null, 0);
    return out;
  })();



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

  // Filter parent options: same type, exclude self (e descendentes, para evitar ciclos)
  const sameTypeCategories = allCategories.filter((c: any) => c.transaction_type === type);

  const descendantIds = (() => {
    const ids = new Set<string>();
    if (!editCategory) return ids;
    const walk = (parent: string) => {
      sameTypeCategories.forEach((c: any) => {
        if (c.parent_id === parent && !ids.has(c.id)) {
          ids.add(c.id);
          walk(c.id);
        }
      });
    };
    walk(editCategory.id);
    return ids;
  })();

  // Ordena em árvore (raiz -> filhos), respeitando sort_order/nome, com profundidade
  const parentOptions = (() => {
    const byParent = new Map<string | null, any[]>();
    sameTypeCategories.forEach((c: any) => {
      const key = c.parent_id ?? null;
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
    const out: { cat: any; depth: number }[] = [];
    const walk = (parent: string | null, depth: number) => {
      (byParent.get(parent) ?? []).forEach((c: any) => {
        if (c.id === editCategory?.id || descendantIds.has(c.id)) return;
        out.push({ cat: c, depth });
        walk(c.id, depth + 1);
      });
    };
    walk(null, 0);
    return out;
  })();


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
    if (saving) return;
    const catValidated = validateWithToast(categorySchema, { name, transaction_type: type, color, category_subtype: subtype || undefined }, toast.error);
    if (!catValidated) return;

    // Categorias raiz (sem pai) são salvas em CAIXA ALTA
    const finalName = parentId ? name.trim() : name.trim().toUpperCase();

    // Impede duplicidade de nome entre irmãos no mesmo escopo
    const duplicate = allCategories.find(
      (c: any) =>
        c.id !== editCategory?.id &&
        (c.parent_id ?? null) === (parentId || null) &&
        c.transaction_type === type &&
        (c.name ?? "").trim().toLowerCase() === finalName.toLowerCase()
    );
    if (duplicate) {
      toast.error("Já existe uma categoria com esse nome no mesmo nível");
      return;
    }

    setSaving(true);


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

  const Section = ({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) => (
    <section className="space-y-4">
      <div className="space-y-0.5">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
        {description && <p className="text-xs text-muted-foreground/80">{description}</p>}
      </div>
      {children}
    </section>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg p-0 gap-0 flex flex-col max-h-[92dvh] overflow-hidden">
        <DialogHeader className="px-5 py-4 border-b text-left space-y-1">
          <DialogTitle className="text-base">{editCategory ? "Editar Categoria" : "Nova Categoria"}</DialogTitle>
          <DialogDescription className="text-xs">
            {parentId
              ? <>Subcategoria de <span className="font-medium text-foreground">{parentNameById(parentId) ?? "..."}</span></>
              : "Categoria raiz — o nome será salvo em caixa alta"}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col min-h-0 flex-1">
          <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">
            <Section title="Identificação">
              <div className="space-y-2">
                <Label htmlFor="cat-name">Nome</Label>
                <Input
                  id="cat-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Alimentação"
                  maxLength={50}
                  autoComplete="off"
                  className="h-11"
                />
                <p className="text-[11px] text-muted-foreground text-right tabular-nums">{name.length}/50</p>
              </div>

              <div className="space-y-2">
                <Label>Tipo</Label>
                <div role="radiogroup" aria-label="Tipo da categoria" className="grid grid-cols-2 gap-2">
                  {([
                    { value: "despesa", label: "Despesa" },
                    { value: "receita", label: "Receita" },
                  ] as const).map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      role="radio"
                      aria-checked={type === opt.value}
                      onClick={() => setType(opt.value)}
                      className={cn(
                        "h-11 rounded-md border text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                        type === opt.value
                          ? opt.value === "receita"
                            ? "border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                            : "border-destructive bg-destructive/10 text-destructive"
                          : "border-input bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Cor</Label>
                <div className="flex gap-2 flex-wrap" role="radiogroup" aria-label="Cor da categoria">
                  {COLOR_OPTIONS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      role="radio"
                      aria-checked={color === c}
                      aria-label={`Cor ${c}`}
                      onClick={() => setColor(c)}
                      className={cn(
                        "h-8 w-8 rounded-full border-2 transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                        color === c ? "border-foreground scale-110" : "border-transparent"
                      )}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
            </Section>

            <div className="border-t" />

            <Section title="Classificação" description="Define onde a categoria aparece na hierarquia e nos relatórios.">
              <div className="space-y-2">
                <Label>Categoria Pai (opcional)</Label>
                <Select value={parentId ?? "__none__"} onValueChange={(v) => setParentId(!v || v === "__none__" ? null : v)}>
                  <SelectTrigger className="h-11">
                    {parentId ? (
                      (() => {
                        const sel = allCategories.find((c: any) => c.id === parentId) as any;
                        return (
                          <span className="flex items-center gap-2 min-w-0">
                            <span
                              className="h-2.5 w-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: sel?.color ?? "#94a3b8" }}
                              aria-hidden
                            />
                            <span className="truncate">{sel?.name ?? "Carregando..."}</span>
                          </span>
                        );
                      })()
                    ) : (
                      <span className="truncate">Nenhuma (raiz)</span>
                    )}
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    <SelectItem value="__none__">Nenhuma (raiz)</SelectItem>
                    {parentOptions.map(({ cat, depth }) => (
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

                {parentOptions.length === 0 && (
                  <p className="text-xs text-muted-foreground">Crie categorias raiz do mesmo tipo primeiro</p>
                )}
              </div>

              <div className="space-y-2">
                <Label>
                  Subtipo <span className="text-destructive" aria-hidden>*</span>
                </Label>
                <Select value={subtype} onValueChange={(v) => setSubtype(v)}>
                  <SelectTrigger className="h-11"><SelectValue placeholder="Selecione o subtipo" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="receita">Receita</SelectItem>
                    <SelectItem value="saida">Saída</SelectItem>
                    <SelectItem value="custo">Custo</SelectItem>
                    <SelectItem value="despesa">Despesa</SelectItem>
                    <SelectItem value="imposto">Imposto</SelectItem>
                    <SelectItem value="investimento">Investimento</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Usado para agrupar valores no DRE e no Balanço.</p>
              </div>

              <div className="space-y-2">
                <Label>Conta Contábil (opcional)</Label>
                <Popover open={chartAccountPopoverOpen} onOpenChange={setChartAccountPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      role="combobox"
                      className="w-full justify-between font-normal h-11"
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
            </Section>

            <div className="border-t" />

            <Section title="Automação com IA" description="Ajuda o sistema a classificar lançamentos automaticamente.">
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="cat-ai-desc" className="text-sm">Descrição (opcional)</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleGenerateAiDescription}
                    disabled={generatingAi || !name.trim() || !subtype}
                    className="h-8 gap-1.5 text-xs"
                  >
                    {generatingAi ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                    ) : (
                      <Sparkles className="h-3.5 w-3.5" aria-hidden />
                    )}
                    {generatingAi ? "Gerando..." : "Gerar com IA"}
                  </Button>
                </div>
                <Textarea
                  id="cat-ai-desc"
                  value={aiDescription}
                  onChange={(e) => setAiDescription(e.target.value)}
                  placeholder="Contexto para o agente classificar lançamentos automaticamente nesta categoria."
                  rows={3}
                  maxLength={500}
                  disabled={generatingAi}
                />
                <p className="text-[11px] text-muted-foreground">
                  Informe nome e subtipo para habilitar a geração automática. Você pode editar o texto antes de salvar.
                </p>
              </div>
            </Section>

            <div className="border-t" />

            <Section title="Visibilidade" description="Selecione onde esta categoria ficará disponível.">
              <label className="flex items-center gap-3 rounded-md border p-3 text-sm cursor-pointer hover:bg-accent/50 transition-colors">
                <Checkbox checked={visiblePf} onCheckedChange={(v) => setVisiblePf(!!v)} />
                Pessoa Física (PF)
              </label>

              {companies.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Empresas</p>
                  {companies.map((company) => (
                    <label
                      key={company.id}
                      className="flex items-center gap-3 rounded-md border p-3 text-sm cursor-pointer hover:bg-accent/50 transition-colors"
                    >
                      <Checkbox
                        checked={selectedCompanies.has(company.id)}
                        onCheckedChange={() => toggleCompany(company.id)}
                      />
                      <span className="truncate">{company.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </Section>

            {editCategory && (editCategory as any).previous_index && (
              <div className="rounded-md border bg-muted/40 p-3 text-xs">
                <p className="text-muted-foreground">Índice anterior</p>
                <p className="font-mono">{(editCategory as any).previous_index}</p>
              </div>
            )}
          </div>

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 border-t px-5 py-4 bg-background">
            <Button type="button" variant="outline" className="h-11 sm:h-10" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button type="submit" className="h-11 sm:h-10 sm:min-w-40" disabled={saving}>
              {saving ? "Salvando..." : editCategory ? "Salvar Alterações" : "Criar Categoria"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

