import { useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Loader2, FileText } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useDpSindicatos, useUpsertDpSindicato, useDeleteDpSindicato, type DpSindicato } from "@/hooks/useDpCadastros";

export default function DpSindicatos() {
  const list = useDpSindicatos();
  const upsert = useUpsertDpSindicato();
  const del = useDeleteDpSindicato();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<DpSindicato | null>(null);
  const [toDelete, setToDelete] = useState<DpSindicato | null>(null);
  const [form, setForm] = useState({
    nome: "", cnpj: "", data_base: "",
    contato_nome: "", contato_email: "", contato_telefone: "", ativo: true,
  });

  const openNew = () => {
    setEditing(null);
    setForm({ nome: "", cnpj: "", data_base: "", contato_nome: "", contato_email: "", contato_telefone: "", ativo: true });
    setOpen(true);
  };

  const openEdit = (s: DpSindicato) => {
    setEditing(s);
    setForm({
      nome: s.nome,
      cnpj: s.cnpj ?? "",
      data_base: s.data_base ?? "",
      contato_nome: s.contato_nome ?? "",
      contato_email: s.contato_email ?? "",
      contato_telefone: s.contato_telefone ?? "",
      ativo: s.ativo,
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
        data_base: form.data_base || null,
        contato_nome: form.contato_nome.trim() || null,
        contato_email: form.contato_email.trim() || null,
        contato_telefone: form.contato_telefone.trim() || null,
        ativo: form.ativo,
      });
      toast.success(editing ? "Sindicato atualizado" : "Sindicato criado");
      setOpen(false);
    } catch (e) {
      toast.error("Erro ao salvar", { description: e instanceof Error ? e.message : String(e) });
    }
  };

  const handleDelete = async () => {
    if (!toDelete) return;
    try {
      await del.mutateAsync(toDelete.id);
      toast.success("Sindicato removido");
    } catch (e) {
      toast.error("Erro ao remover", { description: e instanceof Error ? e.message : String(e) });
    }
    setToDelete(null);
  };

  return (
    <div className="space-y-4">
      <Helmet><title>Sindicatos — DP 360°</title></Helmet>
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-semibold">Sindicatos</h2>
          <p className="text-sm text-muted-foreground">{list.data?.length ?? 0} cadastrados</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link to="/dp/sindicatos/negociacoes"><FileText className="h-4 w-4 mr-2" /> Negociações</Link>
          </Button>
          <Button onClick={openNew}><Plus className="h-4 w-4 mr-2" /> Novo</Button>
        </div>
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
                  <TableHead>Data-base</TableHead>
                  <TableHead>Contato</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-24"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(list.data ?? []).map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.nome}</TableCell>
                    <TableCell>{s.cnpj ?? "—"}</TableCell>
                    <TableCell>{s.data_base ?? "—"}</TableCell>
                    <TableCell>{s.contato_nome ?? "—"}</TableCell>
                    <TableCell>{s.ativo ? <Badge className="bg-primary">Ativo</Badge> : <Badge variant="outline">Inativo</Badge>}</TableCell>
                    <TableCell>
                      <div className="flex gap-1 justify-end">
                        <Button size="icon" variant="ghost" onClick={() => openEdit(s)}><Pencil className="h-4 w-4" /></Button>
                        <Button size="icon" variant="ghost" onClick={() => setToDelete(s)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {(list.data ?? []).length === 0 && (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Nenhum sindicato cadastrado.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar sindicato" : "Novo sindicato"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nome *</Label>
              <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} maxLength={150} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>CNPJ</Label>
                <Input value={form.cnpj} onChange={(e) => setForm({ ...form, cnpj: e.target.value })} maxLength={18} />
              </div>
              <div>
                <Label>Data-base</Label>
                <Input type="date" value={form.data_base} onChange={(e) => setForm({ ...form, data_base: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>Contato — nome</Label>
              <Input value={form.contato_nome} onChange={(e) => setForm({ ...form, contato_nome: e.target.value })} maxLength={120} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>E-mail</Label>
                <Input type="email" value={form.contato_email} onChange={(e) => setForm({ ...form, contato_email: e.target.value })} maxLength={200} />
              </div>
              <div>
                <Label>Telefone</Label>
                <Input value={form.contato_telefone} onChange={(e) => setForm({ ...form, contato_telefone: e.target.value })} maxLength={30} />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.ativo} onCheckedChange={(v) => setForm({ ...form, ativo: v })} />
              <Label>Ativo</Label>
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
            <AlertDialogTitle>Remover sindicato "{toDelete?.nome}"?</AlertDialogTitle>
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
