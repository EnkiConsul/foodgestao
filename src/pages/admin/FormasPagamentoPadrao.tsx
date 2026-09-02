import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CreditCard, Plus, Search, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface Template {
  id: string;
  name: string;
  sort_order: number;
  visible_pf: boolean;
  visible_pj: boolean;
  is_active: boolean;
}

const TABLE = "payment_method_templates" as any;

export default function AdminFormasPagamentoPadrao() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<Template>>({});
  const [saving, setSaving] = useState(false);

  const { data: templates = [] } = useQuery({
    queryKey: ["admin-payment-method-templates"],
    queryFn: async () => {
      const { data, error } = await (supabase.from(TABLE) as any)
        .select("*")
        .order("sort_order")
        .order("name");
      if (error) throw error;
      return (data ?? []) as Template[];
    },
  });

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return templates;
    return templates.filter((t) => t.name.toLowerCase().includes(term));
  }, [templates, search]);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["admin-payment-method-templates"] });

  const openNew = () => {
    setForm({
      name: "",
      sort_order: (templates.at(-1)?.sort_order ?? 0) + 10,
      visible_pf: true,
      visible_pj: true,
      is_active: true,
    });
    setDialogOpen(true);
  };

  const openEdit = (item: Template) => {
    setForm({ ...item });
    setDialogOpen(true);
  };

  const save = async () => {
    const name = (form.name ?? "").trim();
    if (!name) {
      toast.error("Informe o nome da forma de pagamento");
      return;
    }
    if (!form.visible_pj) {
      toast.error("A forma de pagamento precisa estar disponível para empresas");
      return;
    }
    setSaving(true);
    const payload = {
      name,
      sort_order: Number(form.sort_order) || 0,
      visible_pf: false,
      visible_pj: !!form.visible_pj,
      is_active: form.is_active !== false,
    };
    const { error } = form.id
      ? await (supabase.from(TABLE) as any).update(payload).eq("id", form.id)
      : await (supabase.from(TABLE) as any).insert(payload);
    setSaving(false);
    if (error) {
      toast.error("Erro ao salvar", { description: error.message });
      return;
    }
    toast.success(form.id ? "Modelo atualizado" : "Modelo criado");
    setDialogOpen(false);
    invalidate();
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    const { error } = await (supabase.from(TABLE) as any).delete().eq("id", deleteId);
    if (error) toast.error("Erro ao excluir", { description: error.message });
    else {
      toast.success("Modelo excluído");
      invalidate();
    }
    setDeleteId(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Formas de Pagamento Padrão</h1>
          <p className="text-sm text-muted-foreground">
            Modelos criados automaticamente para novos usuários e novas empresas
          </p>
        </div>
        <Button onClick={openNew}>
          <Plus className="h-4 w-4 mr-2" /> Novo modelo
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
          maxLength={50}
        />
      </div>

      {templates.length === 0 ? (
        <Card className="shadow-sm">
          <CardContent className="flex flex-col items-center py-12 text-muted-foreground">
            <CreditCard className="h-10 w-10 mb-3 opacity-40" />
            <p className="text-sm">Nenhum modelo cadastrado</p>
            <Button variant="link" onClick={openNew} className="mt-2">
              Criar primeiro modelo
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((item) => (
            <Card key={item.id} className="shadow-sm hover:shadow transition-shadow">
              <CardContent className="flex items-center gap-3 p-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <CreditCard className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{item.name}</p>
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    <Badge variant={item.is_active ? "secondary" : "outline"} className="text-[10px] h-4 px-1.5">
                      {item.is_active ? "Ativo" : "Inativo"}
                    </Badge>
                    {item.visible_pj && (
                      <Badge variant="outline" className="text-[10px] h-4 px-1.5">Empresa</Badge>
                    )}
                    <Badge variant="outline" className="text-[10px] h-4 px-1.5">#{item.sort_order}</Badge>
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button
                    variant="ghost" size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-primary"
                    onClick={() => openEdit(item)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost" size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => setDeleteId(item.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
          {filtered.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8 col-span-full">
              Nenhum modelo encontrado
            </p>
          )}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{form.id ? "Editar modelo" : "Novo modelo"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="tpl-name">Nome</Label>
              <Input
                id="tpl-name"
                placeholder="Ex: PIX, Dinheiro, Boleto..."
                value={form.name ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                maxLength={60}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tpl-order">Ordem</Label>
              <Input
                id="tpl-order"
                type="number"
                value={form.sort_order ?? 0}
                onChange={(e) => setForm((f) => ({ ...f, sort_order: Number(e.target.value) }))}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="tpl-pj">Criar para novas empresas</Label>
              <Switch
                id="tpl-pj"
                checked={!!form.visible_pj}
                onCheckedChange={(v) => setForm((f) => ({ ...f, visible_pj: v }))}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="tpl-active">Ativo</Label>
              <Switch
                id="tpl-active"
                checked={form.is_active !== false}
                onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button onClick={save} disabled={saving}>{form.id ? "Salvar" : "Criar"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir modelo?</AlertDialogTitle>
            <AlertDialogDescription>
              O modelo deixará de ser criado para novos usuários e empresas. As formas de pagamento
              já criadas nas contas dos clientes não são afetadas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
