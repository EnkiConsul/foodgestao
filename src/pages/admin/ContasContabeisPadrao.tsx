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
};

type FlatNode = Template & { depth: number };

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
};

export default function AdminContasContabeisPadrao() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [form, setForm] = useState<Template>(emptyForm);
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
    return flat.filter((n) => `${n.code} ${n.name}`.toLowerCase().includes(t));
  }, [flat, search]);

  const openNew = (parent: Template | null) => {
    setEditingCode(null);
    setForm({
      ...emptyForm,
      parent_code: parent?.code ?? null,
      code: parent ? `${parent.code}.` : "",
      sort_order: rows.length ? Math.max(...rows.map((r) => r.sort_order)) + 1 : 1,
    });
    setDialogOpen(true);
  };

  const openEdit = (row: Template) => {
    setEditingCode(row.code);
    setForm({ ...row, ai_description: row.ai_description ?? "" });
    setDialogOpen(true);
  };

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
          description="Plano de contas modelo usado ao criar empresas e ao restaurar o modelo padrão. Sintéticas agrupam; analíticas recebem lançamentos."
        />
        <Button size="sm" onClick={() => openNew(null)} className="min-h-9">
          <Plus className="h-4 w-4 mr-2" /> Nova conta padrão
        </Button>
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
                  <span className={`text-xs md:text-sm truncate ${n.is_synthetic ? "font-semibold" : ""}`}>
                    {n.name}
                  </span>
                </span>
                <div className="hidden md:flex items-center gap-1 shrink-0">
                  {n.is_tax && <Badge variant="secondary" className="text-[10px]">Imposto</Badge>}
                  <Badge variant={n.is_synthetic ? "outline" : "default"} className="text-[10px]">
                    {n.is_synthetic ? "Sintética" : "Analítica"}
                  </Badge>
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
            <DialogTitle>{editingCode ? "Editar conta padrão" : "Nova conta padrão"}</DialogTitle>
            <DialogDescription>
              O código define a posição no plano de contas (ex.: 3.1.2).
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

            <div className="space-y-2">
              <Label>Ordem</Label>
              <Input
                type="number"
                value={form.sort_order}
                onChange={(e) => setForm((f) => ({ ...f, sort_order: Number(e.target.value) }))}
              />
            </div>

            <div className="space-y-2">
              <Label>Descrição para IA</Label>
              <Textarea
                rows={3}
                value={form.ai_description ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, ai_description: e.target.value }))}
                placeholder="Explique quando esta conta deve ser usada."
              />
            </div>

            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <p className="text-sm font-medium">Conta sintética</p>
                <p className="text-xs text-muted-foreground">Sintética agrupa e não recebe lançamentos.</p>
              </div>
              <Switch
                checked={form.is_synthetic}
                onCheckedChange={(v) => setForm((f) => ({ ...f, is_synthetic: v }))}
              />
            </div>

            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <p className="text-sm font-medium">Conta de imposto</p>
                <p className="text-xs text-muted-foreground">Marca a conta como tributária nos relatórios.</p>
              </div>
              <Switch checked={form.is_tax} onCheckedChange={(v) => setForm((f) => ({ ...f, is_tax: v }))} />
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
