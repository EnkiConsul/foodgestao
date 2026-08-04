import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, PlusCircle, Search, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SuggestChartAccountsDialog } from "@/components/admin/SuggestChartAccountsDialog";

import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  chartRootLabel, isChartAccountEligible, isNonResultSubtype, validateChartAccountLink,
} from "@/lib/categories/chartCompat";

import {
  CATEGORY_SUBTYPE_CLS, CATEGORY_SUBTYPE_LABEL, categoryIndent,
  categoryTypeClass, categoryTypeLabel,
} from "@/lib/categories/display";

type Template = {
  code: string;
  parent_code: string | null;
  name: string;
  level: number;
  sort_order: number;
  subtype: string;
  transaction_type: "entrada" | "saida" | "transferencia";
  ai_description: string | null;
  previous_index: string | null;
  is_customizable: boolean;
  chart_account_code: string | null;
  guidance_include: string | null;
  guidance_exclude: string | null;
  keywords: string[];
  examples: string | null;
  in_dre: boolean;
  is_contribution_margin: boolean;
  is_cmv: boolean;
  is_patrimonial: boolean;
};

type ChartTemplate = {
  code: string;
  name: string;
  is_synthetic: boolean;
};

const SUBTYPES = [
  "receita", "saida", "custo", "despesa", "imposto",
  "investimento", "patrimonial", "transferencia",
];



type FlatNode = Template & { depth: number };

function flatten(rows: Template[]): FlatNode[] {
  const byParent = new Map<string | null, Template[]>();
  for (const r of rows) {
    const key = r.parent_code && rows.some((x) => x.code === r.parent_code) ? r.parent_code : null;
    const arr = byParent.get(key) ?? [];
    arr.push(r);
    byParent.set(key, arr);
  }
  for (const arr of byParent.values()) {
    arr.sort((a, b) => a.sort_order - b.sort_order || a.code.localeCompare(b.code));
  }
  const out: FlatNode[] = [];
  const walk = (parent: string | null, depth: number) => {
    for (const item of byParent.get(parent) ?? []) {
      out.push({ ...item, depth });
      walk(item.code, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

const emptyForm: Template = {
  code: "",
  parent_code: null,
  name: "",
  level: 1,
  sort_order: 0,
  subtype: "despesa",
  transaction_type: "saida",
  ai_description: "",
  previous_index: null,
  is_customizable: true,
  chart_account_code: null,
  guidance_include: "",
  guidance_exclude: "",
  keywords: [],
  examples: "",
  in_dre: true,
  is_contribution_margin: false,
  is_cmv: false,
  is_patrimonial: false,
};



export default function AdminCategoriasPadrao() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [form, setForm] = useState<Template>(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<Template | null>(null);
  const [saving, setSaving] = useState(false);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["admin-category-templates"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("category_templates")
        .select("*")
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as Template[];
    },
  });

  const { data: chartRows = [] } = useQuery({
    queryKey: ["admin-chart-account-templates-select"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("chart_account_templates")
        .select("code, name, is_synthetic")
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as ChartTemplate[];
    },
  });

  const chartByCode = useMemo(
    () => new Map(chartRows.map((c) => [c.code, c])),
    [chartRows]
  );

  const chartCompat = useMemo(() => {
    if (!form.chart_account_code) return null;
    const acc = chartByCode.get(form.chart_account_code);
    if (!acc) {
      return {
        ok: false,
        level: "error" as const,
        message: `A conta ${form.chart_account_code} não existe mais no plano de contas padrão.`,
      };
    }
    return validateChartAccountLink({
      transactionType: form.transaction_type,
      subtype: form.subtype,
      account: acc,
    });
  }, [form.chart_account_code, form.transaction_type, form.subtype, chartByCode]);


  const [applying, setApplying] = useState(false);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const applyToExisting = async () => {
    setApplying(true);
    const { data, error } = await (supabase as any).rpc(
      "category_templates_apply_chart_accounts",
      { _overwrite: false }
    );
    setApplying(false);
    if (error) {
      toast.error("Erro ao aplicar vínculos", { description: error.message });
      return;
    }
    toast.success(`Vínculos aplicados: ${data ?? 0} categoria(s) atualizada(s)`);
  };

  const pendingLabels = useMemo(() => {
    const out: Record<string, string> = {};
    for (const r of rows) if (!r.chart_account_code) out[r.code] = r.name;
    return out;
  }, [rows]);

  const chartNames = useMemo(() => {
    const out: Record<string, string> = {};
    for (const c of chartRows) out[c.code] = c.name;
    return out;
  }, [chartRows]);





  const flat = useMemo(() => flatten(rows), [rows]);
  const visible = useMemo(() => {
    const t = search.trim().toLowerCase();
    if (!t) return flat;
    return flat.filter((n) => `${n.code} ${n.name}`.toLowerCase().includes(t));
  }, [flat, search]);

  const openNew = (parent: Template | null) => {
    setEditingCode(null);
    setForm({
      ...emptyForm,
      parent_code: parent?.code ?? null,
      level: parent ? parent.level + 1 : 1,
      subtype: parent?.subtype ?? emptyForm.subtype,
      transaction_type: parent?.transaction_type ?? emptyForm.transaction_type,
      sort_order: rows.length ? Math.max(...rows.map((r) => r.sort_order)) + 1 : 1,
    });
    setDialogOpen(true);
  };

  const openEdit = (row: Template) => {
    setEditingCode(row.code);
    setForm({
      ...row,
      ai_description: row.ai_description ?? "",
      guidance_include: row.guidance_include ?? "",
      guidance_exclude: row.guidance_exclude ?? "",
      examples: row.examples ?? "",
      keywords: row.keywords ?? [],
    });
    setDialogOpen(true);
  };

  const save = async () => {
    if (!form.code.trim() || !form.name.trim()) {
      toast.error("Código e nome são obrigatórios");
      return;
    }
    if (chartCompat && !chartCompat.ok) {
      toast.error("Conta contábil incompatível", { description: chartCompat.message });
      return;
    }
    setSaving(true);

    const payload = {
      code: form.code.trim(),
      parent_code: form.parent_code || null,
      name: form.name.trim(),
      level: Number(form.level) || 1,
      sort_order: Number(form.sort_order) || 0,
      subtype: form.subtype,
      transaction_type: form.transaction_type,
      ai_description: form.ai_description?.trim() || null,
      is_customizable: form.is_customizable,
      chart_account_code: form.chart_account_code || null,
      guidance_include: form.guidance_include?.trim() || null,
      guidance_exclude: form.guidance_exclude?.trim() || null,
      examples: form.examples?.trim() || null,
      keywords: form.keywords ?? [],
      in_dre: form.in_dre,
      is_contribution_margin: form.is_contribution_margin,
      is_cmv: form.is_cmv,
      is_patrimonial: form.is_patrimonial,
    };


    const q = editingCode
      ? (supabase as any).from("category_templates").update(payload).eq("code", editingCode)
      : (supabase as any).from("category_templates").insert(payload);
    const { error } = await q;
    setSaving(false);
    if (error) {
      toast.error("Erro ao salvar", { description: error.message });
      return;
    }
    toast.success(editingCode ? "Modelo atualizado" : "Modelo criado");
    qc.invalidateQueries({ queryKey: ["admin-category-templates"] });
    setDialogOpen(false);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    if (rows.some((r) => r.parent_code === deleteTarget.code)) {
      toast.error("Não é possível excluir", { description: "Este modelo possui filhos." });
      setDeleteTarget(null);
      return;
    }
    const { error } = await (supabase as any)
      .from("category_templates").delete().eq("code", deleteTarget.code);
    if (error) toast.error("Erro ao excluir", { description: error.message });
    else {
      toast.success("Modelo excluído");
      qc.invalidateQueries({ queryKey: ["admin-category-templates"] });
    }
    setDeleteTarget(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
        <AdminPageHeader
          title="Categorias Padrão"
          description="Modelo de categorias aplicado a todo novo cadastro. Alterações valem para as próximas empresas criadas."
        />
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => setSuggestOpen(true)} className="min-h-9">
            <Sparkles className="h-4 w-4 mr-2" /> Sugerir contas com IA
          </Button>
          <Button size="sm" variant="outline" onClick={applyToExisting} disabled={applying} className="min-h-9">
            {applying ? "Aplicando..." : "Aplicar vínculos aos cadastros existentes"}
          </Button>

          <Button size="sm" onClick={() => openNew(null)} className="min-h-9">
            <Plus className="h-4 w-4 mr-2" /> Nova categoria padrão
          </Button>
        </div>
      </div>


      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por código ou nome..."
          className="pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <Card className="p-2">
        {isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-6 w-full" />)}
          </div>
        ) : visible.length === 0 ? (
          <p className="p-10 text-center text-sm text-muted-foreground">
            Nenhum modelo de categoria encontrado.
          </p>
        ) : (
          <div className="divide-y">
            {visible.map((n) => (
              <div key={n.code} className="flex items-center gap-2 py-2 px-2 rounded hover:bg-muted/50 group">
                <span
                  className="flex-1 min-w-0 flex items-center gap-2"
                  style={{ paddingLeft: categoryIndent(n.depth, 4) }}
                >
                  <span className="font-mono text-[10px] md:text-xs text-muted-foreground w-16 shrink-0 truncate">
                    {n.code}
                  </span>
                  <span className="text-xs md:text-sm truncate">{n.name}</span>
                </span>
                <div className="hidden md:flex items-center gap-1 shrink-0">
                  {n.chart_account_code ? (
                    <Badge variant="outline" className="text-[10px] font-mono" title={chartByCode.get(n.chart_account_code)?.name ?? ""}>
                      {n.chart_account_code}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px] text-muted-foreground">Sem conta</Badge>
                  )}
                  <Badge variant="outline" className={`text-[10px] border-0 ${categoryTypeClass(n.transaction_type)}`}>
                    {categoryTypeLabel(n.transaction_type)}
                  </Badge>
                  <Badge variant="outline" className={`text-[10px] border-0 ${CATEGORY_SUBTYPE_CLS[n.subtype] ?? ""}`}>
                    {CATEGORY_SUBTYPE_LABEL[n.subtype] ?? n.subtype}
                  </Badge>
                  {!n.is_customizable && <Badge variant="secondary" className="text-[10px]">Fixa</Badge>}
                </div>

                <div className="flex items-center gap-0.5 md:opacity-0 md:group-hover:opacity-100 transition-opacity shrink-0">
                  <Button variant="ghost" size="icon" className="h-8 w-8 md:h-7 md:w-7" title="Adicionar filha" onClick={() => openNew(n)}>
                    <PlusCircle className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 md:h-7 md:w-7" title="Editar" onClick={() => openEdit(n)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 md:h-7 md:w-7 text-destructive" title="Excluir" onClick={() => setDeleteTarget(n)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingCode ? "Editar categoria padrão" : "Nova categoria padrão"}</DialogTitle>
            <DialogDescription>
              O código identifica o modelo e é usado como referência de hierarquia.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Código</Label>
                <Input
                  value={form.code}
                  disabled={!!editingCode}
                  onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                  placeholder="ex.: 3.1.2"
                />
              </div>
              <div className="space-y-2">
                <Label>Categoria pai</Label>
                <Select
                  value={form.parent_code ?? "none"}
                  onValueChange={(v) => setForm((f) => ({ ...f, parent_code: v === "none" ? null : v }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    <SelectItem value="none">Sem pai (raiz)</SelectItem>
                    {flat
                      .filter((n) => n.code !== editingCode)
                      .map((n) => (
                        <SelectItem key={n.code} value={n.code}>
                          {n.code} — {n.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Nome</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Tipo</Label>
                <Select
                  value={form.transaction_type}
                  onValueChange={(v) => setForm((f) => ({ ...f, transaction_type: v as Template["transaction_type"] }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="entrada">Entrada</SelectItem>
                    <SelectItem value="saida">Saída</SelectItem>
                    <SelectItem value="transferencia">Transferência</SelectItem>
                  </SelectContent>

                </Select>
              </div>
              <div className="space-y-2">
                <Label>Subtipo</Label>
                <Select value={form.subtype} onValueChange={(v) => setForm((f) => ({ ...f, subtype: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SUBTYPES.map((s) => (
                      <SelectItem key={s} value={s}>{CATEGORY_SUBTYPE_LABEL[s] ?? s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Nível</Label>
                <Input
                  type="number" min={1}
                  value={form.level}
                  onChange={(e) => setForm((f) => ({ ...f, level: Number(e.target.value) }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Ordem</Label>
                <Input
                  type="number"
                  value={form.sort_order}
                  onChange={(e) => setForm((f) => ({ ...f, sort_order: Number(e.target.value) }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Conta contábil padrão</Label>
              <Select
                value={form.chart_account_code ?? "none"}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, chart_account_code: v === "none" ? null : v }))
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value="none">Sem conta contábil</SelectItem>
                  {chartRows
                    .filter((c) => isChartAccountEligible(c, form.transaction_type, form.subtype))
                    .map((c) => (
                      <SelectItem key={c.code} value={c.code}>
                        {c.code} — {c.name} ({chartRootLabel(c.code)})
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              {chartCompat?.message ? (
                <p
                  className={`text-xs ${chartCompat.ok ? "text-warning" : "text-destructive"}`}
                  role="alert"
                >
                  {chartCompat.message}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {isNonResultSubtype(form.subtype) || form.transaction_type === "transferencia"
                    ? "Só aparecem contas analíticas de Ativo, Passivo, Patrimônio Líquido ou de controle."
                    : form.transaction_type === "entrada"
                      ? "Só aparecem contas analíticas de Receitas."
                      : "Só aparecem contas analíticas de Custos, Despesas e Impostos."}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>O que lançar aqui</Label>
              <Textarea
                rows={2}
                value={form.guidance_include ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, guidance_include: e.target.value }))}
                placeholder="Ex.: Compras de frutas, legumes e verduras para a produção."
              />
              <p className="text-xs text-muted-foreground">
                Aparece como orientação para o usuário e para a IA de categorização.
              </p>
            </div>

            <div className="space-y-2">
              <Label>O que NÃO lançar aqui</Label>
              <Textarea
                rows={2}
                value={form.guidance_exclude ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, guidance_exclude: e.target.value }))}
                placeholder="Ex.: Não lance embalagens nem material de limpeza."
              />
            </div>

            <div className="space-y-2">
              <Label>Palavras-chave</Label>
              <Input
                value={(form.keywords ?? []).join(", ")}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    keywords: e.target.value
                      .split(",")
                      .map((k) => k.trim())
                      .filter(Boolean),
                  }))
                }
                placeholder="ifood, marketplace, comissao"
              />
              <p className="text-xs text-muted-foreground">
                Separe por vírgula. Usadas para reconhecer a descrição do lançamento.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Exemplos de fornecedores e documentos</Label>
              <Textarea
                rows={2}
                value={form.examples ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, examples: e.target.value }))}
                placeholder="Ex.: Nota do Ceasa, feira, distribuidor de hortifruti."
              />
            </div>

            <div className="rounded-md border divide-y">
              {([
                ["in_dre", "Entra na DRE", "Desative para movimentações patrimoniais e transferências."],
                ["is_contribution_margin", "Compõe margem de contribuição", "Marque para receitas e custos que variam com a venda."],
                ["is_cmv", "É CMV", "Marque para insumos, mercadorias e perdas de estoque."],
                ["is_patrimonial", "É patrimonial", "Marque para aportes, empréstimos, ativos e sócios."],
              ] as const).map(([field, title, help]) => (
                <div key={field} className="flex items-center justify-between gap-3 p-3">
                  <div>
                    <p className="text-sm font-medium">{title}</p>
                    <p className="text-xs text-muted-foreground">{help}</p>
                  </div>
                  <Switch
                    checked={form[field]}
                    onCheckedChange={(v) => setForm((f) => ({ ...f, [field]: v }))}
                  />
                </div>
              ))}
            </div>






            <div className="space-y-2">
              <Label>Descrição para IA</Label>
              <Textarea
                rows={3}
                value={form.ai_description ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, ai_description: e.target.value }))}
                placeholder="Explique quando esta categoria deve ser usada."
              />
            </div>

            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <p className="text-sm font-medium">Personalizável pelo cliente</p>
                <p className="text-xs text-muted-foreground">Se desativado, o cliente não pode renomear ou excluir.</p>
              </div>
              <Switch
                checked={form.is_customizable}
                onCheckedChange={(v) => setForm((f) => ({ ...f, is_customizable: v }))}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button
              onClick={save}
              disabled={saving || (!!chartCompat && !chartCompat.ok)}
              title={chartCompat && !chartCompat.ok ? chartCompat.message : undefined}
            >
              {saving ? "Salvando..." : "Salvar"}
            </Button>

          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir modelo de categoria?</AlertDialogTitle>
            <AlertDialogDescription>
              Cadastros já existentes não são afetados. Apenas novos cadastros deixarão de receber esta categoria.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <SuggestChartAccountsDialog
        open={suggestOpen}
        onOpenChange={setSuggestOpen}
        pendingLabels={pendingLabels}
        chartNames={chartNames}
        onApplied={() => qc.invalidateQueries({ queryKey: ["admin-category-templates"] })}
      />
    </div>

  );
}
