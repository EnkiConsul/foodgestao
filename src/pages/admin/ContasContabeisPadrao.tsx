import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, PlusCircle, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
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

type Template = {
  code: string;
  parent_code: string | null;
  name: string;
  is_synthetic: boolean;
  is_tax: boolean;
  ai_description: string | null;
  sort_order: number;
  template_key: string | null;
  usage_description: string | null;
  keywords: string[];
  excluded_keywords: string[];
  included_category_examples: string[];
  excluded_category_examples: string[];
  allowed_category_subtypes: string[];
  allowed_transaction_types: string[];
  requires_review: boolean;
  is_dynamic: boolean;
  is_reducer: boolean;
  is_active: boolean;
  dre_line: string | null;
};

type FlatNode = Template & { depth: number };

const SUBTYPES = [
  "receita", "custo", "despesa", "imposto", "investimento", "patrimonial", "transferencia",
] as const;
const TX_TYPES = ["entrada", "saida", "transferencia"] as const;

const SUBTYPE_LABEL: Record<string, string> = {
  receita: "Receita",
  custo: "Custo",
  despesa: "Despesa",
  imposto: "Imposto",
  investimento: "Investimento",
  patrimonial: "Patrimonial",
  transferencia: "Transferência",
};
const TX_LABEL: Record<string, string> = {
  entrada: "Entrada",
  saida: "Saída",
  transferencia: "Transferência",
};

function compareCodes(a: string, b: string) {
  const pa = a.split(".").map((s) => parseInt(s, 10));
  const pb = b.split(".").map((s) => parseInt(s, 10));
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const va = pa[i] ?? 0;
    const vb = pb[i] ?? 0;
    if (Number.isNaN(va) || Number.isNaN(vb)) return a.localeCompare(b);
    if (va !== vb) return va - vb;
  }
  return a.localeCompare(b);
}

function flatten(rows: Template[]): FlatNode[] {
  const byParent = new Map<string | null, Template[]>();
  for (const r of rows) {
    const key = r.parent_code && rows.some((x) => x.code === r.parent_code) ? r.parent_code : null;
    const arr = byParent.get(key) ?? [];
    arr.push(r);
    byParent.set(key, arr);
  }
  for (const arr of byParent.values()) arr.sort((a, b) => compareCodes(a.code, b.code));
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
  is_synthetic: false,
  is_tax: false,
  ai_description: "",
  sort_order: 0,
  template_key: null,
  usage_description: "",
  keywords: [],
  excluded_keywords: [],
  included_category_examples: [],
  excluded_category_examples: [],
  allowed_category_subtypes: [],
  allowed_transaction_types: [],
  requires_review: false,
  is_dynamic: false,
  is_reducer: false,
  is_active: true,
  dre_line: null,
};

const listToText = (v: string[] | null | undefined) => (v ?? []).join(", ");
const textToList = (v: string) =>
  v.split(",").map((s) => s.trim()).filter(Boolean);

export default function AdminContasContabeisPadrao() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [form, setForm] = useState<Template>(emptyForm);
  const [keywordsText, setKeywordsText] = useState("");
  const [excludedKeywordsText, setExcludedKeywordsText] = useState("");
  const [includeText, setIncludeText] = useState("");
  const [excludeText, setExcludeText] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Template | null>(null);
  const [saving, setSaving] = useState(false);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["admin-chart-account-templates"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("chart_account_templates")
        .select("*")
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as Template[];
    },
  });

  const flat = useMemo(() => flatten(rows), [rows]);
  const visible = useMemo(() => {
    const t = search.trim().toLowerCase();
    if (!t) return flat;
    return flat.filter((n) =>
      `${n.code} ${n.name} ${listToText(n.keywords)}`.toLowerCase().includes(t)
    );
  }, [flat, search]);

  const loadForm = (next: Template) => {
    setForm(next);
    setKeywordsText(listToText(next.keywords));
    setExcludedKeywordsText(listToText(next.excluded_keywords));
    setIncludeText(listToText(next.included_category_examples));
    setExcludeText(listToText(next.excluded_category_examples));
  };

  const openNew = (parent: Template | null) => {
    setEditingCode(null);
    loadForm({
      ...emptyForm,
      parent_code: parent?.code ?? null,
      code: parent ? `${parent.code}.` : "",
      allowed_category_subtypes: parent?.allowed_category_subtypes ?? [],
      allowed_transaction_types: parent?.allowed_transaction_types ?? [],
      dre_line: parent?.dre_line ?? null,
      sort_order: rows.length ? Math.max(...rows.map((r) => r.sort_order)) + 1 : 1,
    });
    setDialogOpen(true);
  };

  const openEdit = (row: Template) => {
    setEditingCode(row.code);
    loadForm({ ...row, ai_description: row.ai_description ?? "" });
    setDialogOpen(true);
  };

  const toggleIn = (list: string[], value: string) =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  const save = async () => {
    if (!form.code.trim() || !form.name.trim()) {
      toast.error("Código e nome são obrigatórios");
      return;
    }
    setSaving(true);
    const payload = {
      code: form.code.trim(),
      parent_code: form.parent_code || null,
      name: form.name.trim(),
      is_synthetic: form.is_synthetic,
      is_tax: form.is_tax,
      ai_description: form.ai_description?.trim() || null,
      sort_order: Number(form.sort_order) || 0,
      template_key: form.template_key?.trim() || null,
      usage_description: form.usage_description?.trim() || null,
      keywords: textToList(keywordsText),
      excluded_keywords: textToList(excludedKeywordsText),
      included_category_examples: textToList(includeText),
      excluded_category_examples: textToList(excludeText),
      allowed_category_subtypes: form.allowed_category_subtypes,
      allowed_transaction_types: form.allowed_transaction_types,
      requires_review: form.requires_review,
      is_dynamic: form.is_dynamic,
      is_reducer: form.is_reducer,
      is_active: form.is_active,
      dre_line: form.dre_line?.trim() || null,
    };
    const q = editingCode
      ? (supabase as any).from("chart_account_templates").update(payload).eq("code", editingCode)
      : (supabase as any).from("chart_account_templates").insert(payload);
    const { error } = await q;
    setSaving(false);
    if (error) {
      toast.error("Erro ao salvar", { description: error.message });
      return;
    }
    toast.success(editingCode ? "Conta padrão atualizada" : "Conta padrão criada");
    qc.invalidateQueries({ queryKey: ["admin-chart-account-templates"] });
    setDialogOpen(false);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    if (rows.some((r) => r.parent_code === deleteTarget.code)) {
      toast.error("Não é possível excluir", { description: "Esta conta possui filhas." });
      setDeleteTarget(null);
      return;
    }
    const { error } = await (supabase as any)
      .from("chart_account_templates").delete().eq("code", deleteTarget.code);
    if (error) toast.error("Erro ao excluir", { description: error.message });
    else {
      toast.success("Conta padrão excluída");
      qc.invalidateQueries({ queryKey: ["admin-chart-account-templates"] });
    }
    setDeleteTarget(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
        <AdminPageHeader
          title="Contas Contábeis Padrão"
          description="Plano de contas modelo (Food Service) usado ao criar empresas e ao restaurar o modelo. Sintéticas [S] agrupam; analíticas [A] recebem lançamentos; [D] dinâmicas; [C] redutoras."
        />
        <Button size="sm" onClick={() => openNew(null)} className="min-h-9">
          <Plus className="h-4 w-4 mr-2" /> Nova conta padrão
        </Button>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por código, nome ou palavra-chave..."
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
            Nenhuma conta padrão cadastrada.
          </p>
        ) : (
          <div className="divide-y">
            {visible.map((n) => (
              <div key={n.code} className="flex items-center gap-2 py-2 px-2 rounded hover:bg-muted/50 group">
                <span
                  className="flex-1 min-w-0 flex items-center gap-2"
                  style={{ paddingLeft: `${n.depth * 16 + 4}px` }}
                >
                  <span className="font-mono text-[10px] md:text-xs text-muted-foreground w-14 md:w-20 shrink-0 truncate">
                    {n.code}
                  </span>
                  <span
                    className={`text-xs md:text-sm truncate ${n.is_synthetic ? "font-semibold" : ""} ${!n.is_active ? "text-muted-foreground line-through" : ""}`}
                    title={n.usage_description ?? undefined}
                  >
                    {n.name}
                  </span>
                </span>
                <div className="hidden md:flex items-center gap-1 shrink-0">
                  {n.dre_line && (
                    <Badge variant="outline" className="text-[10px] font-mono">{n.dre_line}</Badge>
                  )}
                  {n.is_tax && <Badge variant="secondary" className="text-[10px]">Imposto</Badge>}
                  {n.is_dynamic && <Badge variant="secondary" className="text-[10px]">D</Badge>}
                  {n.is_reducer && <Badge variant="secondary" className="text-[10px]">C</Badge>}
                  {n.requires_review && <Badge variant="secondary" className="text-[10px]">Revisão</Badge>}
                  <Badge variant={n.is_synthetic ? "outline" : "default"} className="text-[10px]">
                    {n.is_synthetic ? "S" : "A"}
                  </Badge>
                  {!n.is_active && <Badge variant="destructive" className="text-[10px]">Inativa</Badge>}
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
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingCode ? "Editar conta padrão" : "Nova conta padrão"}</DialogTitle>
            <DialogDescription>
              O código define a posição no plano de contas (ex.: 6.2.8). As orientações abaixo guiam o usuário e a vinculação automática por IA.
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
                  placeholder="ex.: 6.2.8"
                />
              </div>
              <div className="space-y-2">
                <Label>Conta pai</Label>
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
                <Label>Chave do modelo</Label>
                <Input
                  value={form.template_key ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, template_key: e.target.value }))}
                  placeholder="ex.: despesa.taxas_de_cartao_de_credito"
                />
                <p className="text-[11px] text-muted-foreground">
                  Identificador estável usado para reconhecer esta conta nas empresas.
                </p>
              </div>
              <div className="space-y-2">
                <Label>Linha da DRE</Label>
                <Input
                  value={form.dre_line ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, dre_line: e.target.value }))}
                  placeholder="ex.: despesas_variaveis_venda"
                />
                <p className="text-[11px] text-muted-foreground">
                  Vazio = conta fora da DRE (patrimonial ou de controle).
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Ordem</Label>
              <Input
                type="number"
                value={form.sort_order}
                onChange={(e) => setForm((f) => ({ ...f, sort_order: Number(e.target.value) }))}
              />
            </div>

            <div className="space-y-2">
              <Label>Como usar esta conta</Label>
              <Textarea
                rows={3}
                value={form.usage_description ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, usage_description: e.target.value }))}
                placeholder="Explique, em linguagem simples, o que deve ser lançado nesta conta."
              />
            </div>

            <div className="space-y-2">
              <Label>Observações técnicas / IA</Label>
              <Textarea
                rows={2}
                value={form.ai_description ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, ai_description: e.target.value }))}
                placeholder="Regras e exceções relevantes para a classificação automática."
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Palavras-chave</Label>
                <Textarea
                  rows={2}
                  value={keywordsText}
                  onChange={(e) => setKeywordsText(e.target.value)}
                  placeholder="separadas por vírgula"
                />
              </div>
              <div className="space-y-2">
                <Label>Palavras-chave de exclusão</Label>
                <Textarea
                  rows={2}
                  value={excludedKeywordsText}
                  onChange={(e) => setExcludedKeywordsText(e.target.value)}
                  placeholder="separadas por vírgula"
                />
              </div>
              <div className="space-y-2">
                <Label>Categorias que devem ser vinculadas</Label>
                <Textarea
                  rows={2}
                  value={includeText}
                  onChange={(e) => setIncludeText(e.target.value)}
                  placeholder="ex.: Taxas de cartão, MDR"
                />
              </div>
              <div className="space-y-2">
                <Label>Categorias que não devem ser vinculadas</Label>
                <Textarea
                  rows={2}
                  value={excludeText}
                  onChange={(e) => setExcludeText(e.target.value)}
                  placeholder="ex.: Antecipação de recebíveis"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Tipos de categoria aceitos</Label>
              <div className="flex flex-wrap gap-2">
                {SUBTYPES.map((s) => {
                  const active = form.allowed_category_subtypes.includes(s);
                  return (
                    <Button
                      key={s}
                      type="button"
                      size="sm"
                      variant={active ? "default" : "outline"}
                      className="h-7 text-xs"
                      onClick={() =>
                        setForm((f) => ({
                          ...f,
                          allowed_category_subtypes: toggleIn(f.allowed_category_subtypes, s),
                        }))
                      }
                    >
                      {SUBTYPE_LABEL[s]}
                    </Button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Tipos de movimento aceitos</Label>
              <div className="flex flex-wrap gap-2">
                {TX_TYPES.map((t) => {
                  const active = form.allowed_transaction_types.includes(t);
                  return (
                    <Button
                      key={t}
                      type="button"
                      size="sm"
                      variant={active ? "default" : "outline"}
                      className="h-7 text-xs"
                      onClick={() =>
                        setForm((f) => ({
                          ...f,
                          allowed_transaction_types: toggleIn(f.allowed_transaction_types, t),
                        }))
                      }
                    >
                      {TX_LABEL[t]}
                    </Button>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-2">
              {([
                ["is_synthetic", "Conta sintética [S]", "Agrupa e não recebe lançamentos."],
                ["is_dynamic", "Conta dinâmica [D]", "O sistema pode criar filhas automaticamente (bancos, cartões, contratos)."],
                ["is_reducer", "Conta redutora [C]", "Reduz o saldo do grupo em que está."],
                ["is_tax", "Conta de imposto", "Marca a conta como tributária nos relatórios."],
                ["requires_review", "Exige revisão", "Conta transitória: o lançamento deve ser reclassificado."],
                ["is_active", "Conta ativa no modelo", "Contas inativas não são criadas em novas empresas."],
              ] as const).map(([key, title, desc]) => (
                <div key={key} className="flex items-center justify-between rounded-md border p-3">
                  <div>
                    <p className="text-sm font-medium">{title}</p>
                    <p className="text-xs text-muted-foreground">{desc}</p>
                  </div>
                  <Switch
                    checked={form[key]}
                    onCheckedChange={(v) => setForm((f) => ({ ...f, [key]: v }))}
                  />
                </div>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={save} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir conta padrão?</AlertDialogTitle>
            <AlertDialogDescription>
              Empresas já criadas mantêm suas contas. Apenas novos cadastros deixarão de receber esta conta.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
