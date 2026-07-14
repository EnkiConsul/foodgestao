import { useState } from "react";
import { Helmet } from "react-helmet-async";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useDpUnidades, useUpsertDpUnidade, useDeleteDpUnidade, type DpUnidade } from "@/hooks/useDpCadastros";

export default function DpUnidades() {
  const list = useDpUnidades();
  const upsert = useUpsertDpUnidade();
  const del = useDeleteDpUnidade();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<DpUnidade | null>(null);
  const [toDelete, setToDelete] = useState<DpUnidade | null>(null);
  const [form, setForm] = useState({ nome: "", cnpj: "", endereco: "", cidade: "", uf: "", ativo: true });

  const openNew = () => {
    setEditing(null);
    setForm({ nome: "", cnpj: "", endereco: "", cidade: "", uf: "", ativo: true });
    setOpen(true);
  };

  const openEdit = (u: DpUnidade) => {
    setEditing(u);
    setForm({
      nome: u.nome,
      cnpj: u.cnpj ?? "",
      endereco: u.endereco ?? "",
      cidade: u.cidade ?? "",
      uf: u.uf ?? "",
      ativo: u.ativo,
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.nome.trim()) {
      toast.error("Nome é obrigatório");
      return;
    }
    try {
      await upsert.mutateAsync({
        id: editing?.id,
        nome: form.nome.trim(),
        cnpj: form.cnpj.trim() || null,
        endereco: form.endereco.trim() || null,
        cidade: form.cidade.trim() || null,
        uf: form.uf.trim().toUpperCase() || null,
        ativo: form.ativo,
      });
      toast.success(editing ? "Unidade atualizada" : "Unidade criada");
      setOpen(false);
    } catch (e) {
      toast.error("Erro ao salvar", { description: e instanceof Error ? e.message : String(e) });
    }
  };

  const handleDelete = async () => {
    if (!toDelete) return;
    try {
      await del.mutateAsync(toDelete.id);
      toast.success("Unidade removida");
    } catch (e) {
      toast.error("Erro ao remover", { description: e instanceof Error ? e.message : String(e) });
    }
    setToDelete(null);
  };

  return (
    <div className="space-y-4">
      <Helmet><title>Unidades — DP 360°</title></Helmet>
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-semibold">Unidades</h2>
          <p className="text-sm text-muted-foreground">{list.data?.length ?? 0} cadastradas</p>
        </div>
        <Button onClick={openNew}><Plus className="h-4 w-4 mr-2" /> Nova</Button>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {list.isLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>CNPJ</TableHead>
                  <TableHead>Cidade / UF</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-24"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(list.data ?? []).map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.nome}</TableCell>
                    <TableCell>{u.cnpj ?? "—"}</TableCell>
                    <TableCell>{[u.cidade, u.uf].filter(Boolean).join(" / ") || "—"}</TableCell>
                    <TableCell>{u.ativo ? <Badge className="bg-primary">Ativa</Badge> : <Badge variant="outline">Inativa</Badge>}</TableCell>
                    <TableCell>
                      <div className="flex gap-1 justify-end">
                        <Button size="icon" variant="ghost" onClick={() => openEdit(u)}><Pencil className="h-4 w-4" /></Button>
                        <Button size="icon" variant="ghost" onClick={() => setToDelete(u)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {(list.data ?? []).length === 0 && (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Nenhuma unidade cadastrada.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar unidade" : "Nova unidade"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nome *</Label>
              <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} maxLength={120} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>CNPJ</Label>
                <Input value={form.cnpj} onChange={(e) => setForm({ ...form, cnpj: e.target.value })} maxLength={18} />
              </div>
              <div className="flex items-end gap-2 pb-1">
                <Switch checked={form.ativo} onCheckedChange={(v) => setForm({ ...form, ativo: v })} />
                <Label>Ativa</Label>
              </div>
            </div>
            <div>
              <Label>Endereço</Label>
              <Input value={form.endereco} onChange={(e) => setForm({ ...form, endereco: e.target.value })} maxLength={200} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <Label>Cidade</Label>
                <Input value={form.cidade} onChange={(e) => setForm({ ...form, cidade: e.target.value })} maxLength={80} />
              </div>
              <div>
                <Label>UF</Label>
                <Input value={form.uf} onChange={(e) => setForm({ ...form, uf: e.target.value.toUpperCase() })} maxLength={2} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save} disabled={upsert.isPending}>{upsert.isPending ? "Salvando..." : "Salvar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover unidade "{toDelete?.nome}"?</AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Remover</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
